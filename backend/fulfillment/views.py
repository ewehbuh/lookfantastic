from django.conf import settings
from django.db import transaction, IntegrityError
from django.db.models import Sum, F
from django.utils import timezone
from rest_framework import viewsets, permissions, serializers
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from cart.models import Order, OrderItem
from cart.serializers import OrderSerializer
from cart.guest_orders import token_order
from products.models import Variant
from .models import Shipment, ShipmentEvent, ReturnRequest, Refund
from .serializers import ShipmentSerializer, ReturnSerializer, RefundSerializer, AdminRefundSerializer
from .refunds import RefundInput, reserve_refund, dispatch_refund


class OrderViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = OrderSerializer
    permission_classes = [permissions.IsAuthenticated]
    lookup_field = 'order_number'

    def get_queryset(self):
        return Order.objects.filter(user=self.request.user).prefetch_related('items', 'shipments__events').order_by('-created_at', '-pk')


class AdminShipmentViewSet(viewsets.ModelViewSet):
    serializer_class = ShipmentSerializer
    permission_classes = [permissions.IsAdminUser]
    queryset = Shipment.objects.select_related('order').prefetch_related('events').all()
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    @transaction.atomic
    def perform_create(self, serializer):
        order = Order.objects.select_for_update().get(pk=serializer.validated_data['order'].pk)
        if order.status not in ['paid', 'processing', 'shipped']:
            raise ValidationError({'order': 'Order is not paid.'})
        shipment = serializer.save()
        self.record(shipment, order)

    def get_object(self):
        if self.request.method == 'PATCH':
            self.queryset = self.queryset.select_for_update()
        return super().get_object()

    @transaction.atomic
    def partial_update(self, request, *args, **kwargs):
        return super().partial_update(request, *args, **kwargs)

    def perform_update(self, serializer):
        original = serializer.instance.status
        shipment = serializer.save()
        if original != shipment.status:
            order = Order.objects.select_for_update().get(pk=shipment.order_id)
            self.record(shipment, order)

    @staticmethod
    def record(shipment, order):
        ShipmentEvent.objects.create(shipment=shipment, status=shipment.status)
        if shipment.status == 'delivered':
            shipment.delivered_at = timezone.now()
            shipment.save(update_fields=['delivered_at'])
        if order.status in ['paid', 'processing', 'shipped']:
            order.status = 'shipped' if order.status == 'shipped' or order.shipments.filter(
                status__in=['in_transit', 'delivered']).exists() else 'processing'
            order.save(update_fields=['status', 'updated_at'])


class ReturnInput(serializers.Serializer):
    order_number = serializers.CharField(max_length=20)
    item_id = serializers.IntegerField(min_value=1)
    quantity = serializers.IntegerField(min_value=1, max_value=10000)
    reason = serializers.CharField(max_length=2000)
    token = serializers.CharField(max_length=200, required=False, write_only=True)


class ReturnThrottle(AnonRateThrottle):
    rate = '20/hour'


class ReturnViewSet(viewsets.GenericViewSet):
    serializer_class = ReturnSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ReturnThrottle]

    def get_permissions(self):
        return [permissions.IsAuthenticated()] if self.action in ['list', 'retrieve'] else super().get_permissions()

    def get_queryset(self):
        return ReturnRequest.objects.filter(order__user=self.request.user).select_related('order', 'item')

    def list(self, request):
        page = self.paginate_queryset(self.get_queryset())
        return self.get_paginated_response(self.get_serializer(page, many=True).data)

    def retrieve(self, request, pk=None):
        return Response(self.get_serializer(self.get_object()).data)

    @transaction.atomic
    def create(self, request):
        payload = ReturnInput(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        if data.get('token'):
            order = token_order(data['order_number'], data['token'])
        else:
            if not request.user.is_authenticated:
                raise ValidationError({'token': 'Guest order access token is required.'})
            order = Order.objects.filter(order_number=data['order_number'], user=request.user).first()
            if not order:
                raise ValidationError({'order_number': 'Order is unavailable.'})
        order = Order.objects.select_for_update().get(pk=order.pk)
        if order.status not in ['paid', 'processing', 'shipped']:
            raise ValidationError({'order_number': 'Only paid orders can be returned.'})
        delivered = order.shipments.filter(delivered_at__isnull=False).order_by('-delivered_at').first()
        anchor = delivered.delivered_at if delivered else order.created_at
        if timezone.now() > anchor + timezone.timedelta(days=settings.RETURNS_WINDOW_DAYS):
            raise ValidationError({'order_number': 'The return window has expired.'})
        item = order.items.select_for_update().filter(pk=data['item_id']).first()
        if not item:
            raise ValidationError({'item_id': 'Item does not belong to this order.'})
        requested = ReturnRequest.objects.filter(item=item).exclude(status='rejected').aggregate(total=Sum('quantity'))['total'] or 0
        if requested + data['quantity'] > item.quantity:
            raise ValidationError({'quantity': 'Return quantity exceeds the remaining purchased quantity.'})
        returned = ReturnRequest.objects.create(order=order, item=item, quantity=data['quantity'], reason=data['reason'])
        return Response(self.get_serializer(returned).data, status=201)


class ReturnModerationSerializer(ReturnSerializer):
    class Meta(ReturnSerializer.Meta):
        fields = [*ReturnSerializer.Meta.fields, 'staff_note']
        read_only_fields = ['order', 'item', 'quantity', 'reason', 'restocked', 'created_at']

    def validate_status(self, value):
        transitions = {'requested': ['approved', 'rejected'], 'approved': ['rejected'],
                       'received': ['closed'], 'rejected': [], 'closed': []}
        if value != self.instance.status and value not in transitions[self.instance.status]:
            raise ValidationError('Invalid return transition; use receive to confirm arrival.')
        if value == 'closed' and not self.instance.refunds.filter(status='succeeded').exists():
            raise ValidationError('Confirm a refund before closing this return.')
        return value


class AdminReturnViewSet(viewsets.ModelViewSet):
    queryset = ReturnRequest.objects.select_related('order', 'item').all()
    serializer_class = ReturnModerationSerializer
    permission_classes = [permissions.IsAdminUser]
    http_method_names = ['get', 'patch', 'post', 'head', 'options']

    def create(self, request, *args, **kwargs):
        return Response({'detail': 'Use the customer return endpoint.'}, status=405)

    def get_object(self):
        if self.request.method in ['PATCH', 'POST']:
            self.queryset = self.queryset.select_for_update()
        return super().get_object()

    @transaction.atomic
    def partial_update(self, request, *args, **kwargs):
        return super().partial_update(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def receive(self, request, pk=None):
        returned = self.get_object()
        restock = serializers.BooleanField().run_validation(request.data.get('restock', False))
        if returned.status == 'received':
            return Response(self.get_serializer(returned).data)
        if returned.status != 'approved':
            raise ValidationError('Only approved returns can be received.')
        if restock:
            if not returned.item.variant_id:
                raise ValidationError('The original SKU no longer exists.')
            Variant.objects.filter(pk=returned.item.variant_id).update(stock=F('stock') + returned.quantity)
            returned.restocked = True
        returned.status = 'received'
        returned.save(update_fields=['status', 'restocked'])
        return Response(self.get_serializer(returned).data)


class AdminRefundViewSet(viewsets.GenericViewSet):
    serializer_class = AdminRefundSerializer
    permission_classes = [permissions.IsAdminUser]
    queryset = Refund.objects.select_related('order').all()

    def list(self, request):
        page = self.paginate_queryset(self.get_queryset())
        return self.get_paginated_response(self.get_serializer(page, many=True).data)

    def retrieve(self, request, pk=None):
        return Response(self.get_serializer(self.get_object()).data)

    def create(self, request):
        payload = RefundInput(data=request.data)
        payload.is_valid(raise_exception=True)
        try:
            refund = reserve_refund(payload.validated_data, request.user)
        except IntegrityError:
            raise ValidationError({'idempotency_key': 'This refund request conflicts with an existing request.'})
        refund = dispatch_refund(refund)
        result = self.get_serializer(refund).data
        result['idempotency_key'] = str(refund.idempotency_key)
        return Response(result, status=200 if refund.status in ['succeeded', 'failed'] else 202)

    @action(detail=True, methods=['post'])
    def retry(self, request, pk=None):
        refund = dispatch_refund(self.get_object())
        return Response(self.get_serializer(refund).data)
