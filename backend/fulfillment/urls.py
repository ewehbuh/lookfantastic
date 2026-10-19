from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import OrderViewSet, ReturnViewSet, AdminShipmentViewSet, AdminReturnViewSet, AdminRefundViewSet

router = DefaultRouter()
router.register('orders', OrderViewSet, basename='order')
router.register('returns', ReturnViewSet, basename='return')
router.register('admin/shipments', AdminShipmentViewSet, basename='admin-shipment')
router.register('admin/returns', AdminReturnViewSet, basename='admin-return')
router.register('admin/refunds', AdminRefundViewSet, basename='admin-refund')
urlpatterns = [path('', include(router.urls))]
