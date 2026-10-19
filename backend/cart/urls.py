from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CartViewSet
from .payments import methods, stripe_webhook, crypto_webhook

router = DefaultRouter()
router.register(r'cart', CartViewSet, basename='cart')

urlpatterns = [
    path('payments/methods/', methods),
    path('payments/stripe/webhook/', stripe_webhook),
    path('payments/crypto/webhook/', crypto_webhook),
    path('', include(router.urls)),
]
