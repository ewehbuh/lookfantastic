import hashlib
import secrets
import logging
from smtplib import SMTPException
from urllib.parse import urlencode
from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes, authentication_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.response import Response
from rest_framework.exceptions import NotFound
from .models import Order, OrderAccessToken


class GuestOrderThrottle(SimpleRateThrottle):
    scope = 'guest_order'
    rate = '20/hour'

    def get_cache_key(self, request, view):
        return self.cache_format % {'scope': self.scope, 'ident': self.get_ident(request)}


class GuestStatusThrottle(GuestOrderThrottle):
    scope = 'guest_order_status'
    rate = '60/min'


def issue_token(order):
    token = secrets.token_urlsafe(32)
    OrderAccessToken.objects.create(order=order, token_hash=hashlib.sha256(token.encode()).hexdigest(),
                                   expires_at=timezone.now() + timezone.timedelta(days=7))
    return token


def token_order(number, token):
    if not isinstance(token, str) or not 20 <= len(token) <= 200:
        raise NotFound('Order access is invalid or expired.')
    access = OrderAccessToken.objects.select_related('order').filter(order__order_number=number,
        order__user__isnull=True, token_hash=hashlib.sha256(token.encode()).hexdigest(),
        expires_at__gt=timezone.now()).first()
    if not access:
        raise NotFound('Order access is invalid or expired.')
    return access.order


class AccessRequestSerializer(serializers.Serializer):
    order_number = serializers.CharField(max_length=20)
    email = serializers.EmailField()


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([GuestOrderThrottle])
def request_access(request):
    payload = AccessRequestSerializer(data=request.data)
    payload.is_valid(raise_exception=True)
    order = Order.objects.filter(order_number=payload.validated_data['order_number'],
        email__iexact=payload.validated_data['email'], user__isnull=True).first()
    if order:
        token = issue_token(order)
        link = settings.FRONTEND_URL.rstrip('/') + '/orders/access?' + urlencode({'order_number': order.order_number, 'token': token})
        try:
            send_mail('Your order access link', 'This link expires in seven days:\n' + link,
                      settings.DEFAULT_FROM_EMAIL, [order.email], fail_silently=False)
        except (SMTPException, OSError):
            logging.getLogger(__name__).warning('Guest order link delivery failed.')
    response = Response({'detail': 'If the details match a guest order, an access link will be emailed.'}, status=202)
    response['Cache-Control'] = 'no-store'
    return response


class LookupSerializer(serializers.Serializer):
    order_number = serializers.CharField(max_length=20)
    token = serializers.CharField(max_length=200)


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([GuestStatusThrottle])
def guest_status(request):
    from .serializers import OrderSerializer
    payload = LookupSerializer(data=request.data)
    payload.is_valid(raise_exception=True)
    order = token_order(payload.validated_data['order_number'], payload.validated_data['token'])
    response = Response(OrderSerializer(order, context={'request': request}).data)
    response['Cache-Control'] = 'no-store'
    return response
