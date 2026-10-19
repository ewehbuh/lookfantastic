from rest_framework import viewsets, permissions
from .models import SubscriptionPlan, UserSubscription, SubscriptionOrder
from .admin_serializers import (
    AdminSubscriptionPlanSerializer,
    AdminUserSubscriptionSerializer,
    AdminSubscriptionOrderSerializer,
)

class AdminSubscriptionPlanViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAdminUser]
    queryset = SubscriptionPlan.objects.all()
    serializer_class = AdminSubscriptionPlanSerializer

class AdminUserSubscriptionViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAdminUser]
    queryset = UserSubscription.objects.all()
    serializer_class = AdminUserSubscriptionSerializer

class AdminSubscriptionOrderViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAdminUser]
    queryset = SubscriptionOrder.objects.all()
    serializer_class = AdminSubscriptionOrderSerializer
