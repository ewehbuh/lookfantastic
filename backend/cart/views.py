from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.db import transaction
from .models import Cart, CartItem, Order
from .serializers import CartSerializer, OrderSerializer, CheckoutSerializer
from products.models import Variant


from .baskets import get_or_create_cart, MAX_QUANTITY
from .serializers import AddItemSerializer, UpdateItemSerializer, RemoveItemSerializer
from products.catalogue import visible_products


class CartViewSet(viewsets.GenericViewSet):
    """
    Manage the shopping cart.
    Endpoints:
      - GET /api/cart/          → Retrieve current cart
      - POST /api/cart/add/     → Add item
      - PATCH /api/cart/update-item/ → Update quantity
      - DELETE /api/cart/remove/ → Remove item
      - POST /api/cart/checkout/ → Create order
    """
    serializer_class = CartSerializer
    queryset = Cart.objects.none()  # we handle the cart manually

    def list(self, request):
        cart = get_or_create_cart(request)
        serializer = self.get_serializer(cart)
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    def add(self, request):
        payload = AddItemSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        cart = get_or_create_cart(request)
        with transaction.atomic():
            Cart.objects.select_for_update().get(pk=cart.pk)
            variant = get_object_or_404(Variant.objects.select_for_update(),
                pk=data['variant_id'], is_active=True, product__in=visible_products())
            item = cart.items.filter(variant=variant).first()
            quantity = data['quantity'] + (item.quantity if item else 0)
            if quantity > variant.stock or quantity > MAX_QUANTITY:
                return Response({'error': 'Not enough stock or quantity limit exceeded.'}, status=400)
            if item:
                item.quantity = quantity
                item.save(update_fields=['quantity'])
            else:
                CartItem.objects.create(cart=cart, variant=variant, quantity=quantity)
            return Response(CartSerializer(cart, context={'request': request}).data, status=201)

    @action(detail=False, methods=['patch'], url_path='update-item')
    def update_item(self, request):
        payload = UpdateItemSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        cart = get_or_create_cart(request)
        with transaction.atomic():
            Cart.objects.select_for_update().get(pk=cart.pk)
            item = get_object_or_404(cart.items, pk=data['item_id'])
            if data['quantity'] == 0:
                item.delete()
            else:
                variant = Variant.objects.select_for_update().filter(pk=item.variant_id, is_active=True,
                    product__in=visible_products()).first()
                if not variant or data['quantity'] > variant.stock:
                    return Response({'error': 'Item unavailable or insufficient stock.'}, status=400)
                item.quantity = data['quantity']
                item.save(update_fields=['quantity'])
            return Response(CartSerializer(cart, context={'request': request}).data)

    @action(detail=False, methods=['delete'])
    def remove(self, request):
        payload = RemoveItemSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        cart = get_or_create_cart(request)
        with transaction.atomic():
            Cart.objects.select_for_update().get(pk=cart.pk)
            item = get_object_or_404(cart.items, pk=payload.validated_data['item_id'])
            item.delete()
            return Response(CartSerializer(cart, context={'request': request}).data)

    @action(detail=False, methods=['post'])
    def checkout(self, request):
        cart = get_or_create_cart(request)
        if not cart.items.exists():
            return Response({'error': 'Cart is empty.'}, status=status.HTTP_400_BAD_REQUEST)

        # Validate shipping details
        checkout_serializer = CheckoutSerializer(data=request.data)
        checkout_serializer.is_valid(raise_exception=True)
        data = checkout_serializer.validated_data

        from .payments import create_checkout
        return create_checkout(request, cart, data)

    @action(detail=False, methods=['get'])
    def orders(self, request):
        """Return the authenticated user's order history."""
        if not request.user.is_authenticated:
            return Response({'error': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)
        orders = Order.objects.filter(user=request.user).prefetch_related('items').order_by('-created_at', '-pk')
        serializer = OrderSerializer(orders, many=True, context={'request': request})
        return Response(serializer.data)
