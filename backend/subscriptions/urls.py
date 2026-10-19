from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import SubscriptionPlanViewSet, SubscriptionViewSet   # public views
from .admin_views import (
    AdminSubscriptionPlanViewSet,
    AdminUserSubscriptionViewSet,
    AdminSubscriptionOrderViewSet,
)

router = DefaultRouter()
router.register(r'plans', SubscriptionPlanViewSet, basename='plan')
router.register(r'my', SubscriptionViewSet, basename='my-subscription')
router.register(r'admin/plans', AdminSubscriptionPlanViewSet, basename='admin-plan')
router.register(r'admin/subscriptions', AdminUserSubscriptionViewSet, basename='admin-subscription')
router.register(r'admin/orders', AdminSubscriptionOrderViewSet, basename='admin-order')

urlpatterns = [
    path('', include(router.urls)),
]
