from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from django.db.models.deletion import ProtectedError
from django.db import transaction
from .models import SubscriptionPlan, UserSubscription, SubscriptionOrder
from .admin_serializers import (
    AdminSubscriptionPlanSerializer,
    AdminUserSubscriptionSerializer,
    AdminSubscriptionOrderSerializer,
)

class AdminSubscriptionPlanViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAdminUser]
    queryset = SubscriptionPlan.objects.all().order_by('-created_at', '-pk')
    serializer_class = AdminSubscriptionPlanSerializer

    def destroy(self, request, *args, **kwargs):
        try:
            with transaction.atomic():
                return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response({'detail': 'This plan has subscriptions. Deactivate it instead.'},
                            status=status.HTTP_409_CONFLICT)

class AdminUserSubscriptionViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAdminUser]
    queryset = UserSubscription.objects.select_related('user', 'plan').order_by('-created_at', '-pk')
    http_method_names = ['get', 'patch', 'head', 'options']
    serializer_class = AdminUserSubscriptionSerializer

    def get_object(self):
        # update() below retains this lock through validation and saving.
        if self.request.method == 'PATCH':
            self.queryset = self.queryset.select_for_update()
        return super().get_object()

    @transaction.atomic
    def partial_update(self, request, *args, **kwargs):
        return super().partial_update(request, *args, **kwargs)

class AdminSubscriptionOrderViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.IsAdminUser]
    queryset = SubscriptionOrder.objects.select_related('user', 'subscription').order_by('-created_at', '-pk')
    serializer_class = AdminSubscriptionOrderSerializer
