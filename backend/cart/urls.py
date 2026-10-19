from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CartViewSet
from .payments import methods, stripe_webhook, crypto_webhook

from .guest_orders import request_access, guest_status
from .vouchers import AdminVoucherViewSet

from .currency import AdminExchangeRateViewSet, currencies

router = DefaultRouter()
router.register('admin/exchange-rates', AdminExchangeRateViewSet, basename='admin-exchange-rate')
router.register('admin/vouchers', AdminVoucherViewSet, basename='admin-voucher')
router.register(r'cart', CartViewSet, basename='cart')

urlpatterns = [
    path('orders/guest-access/', request_access),
    path('orders/guest-status/', guest_status),
    path('payments/methods/', methods),
    path('currencies/', currencies),
    path('payments/stripe/webhook/', stripe_webhook),
    path('payments/crypto/webhook/', crypto_webhook),
    path('', include(router.urls)),
]
