"""Hosted payments: amounts come exclusively from server-side basket prices."""
import hashlib
import hmac
import json
from decimal import Decimal, ROUND_HALF_UP

import requests
import stripe
from django.conf import settings
from django.db import transaction
from django.db.models import F
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from products.models import Variant
from .models import Cart, Order, OrderItem
from .serializers import OrderSerializer


def available_methods():
    ready = bool(settings.STRIPE_SECRET_KEY and settings.STRIPE_WEBHOOK_SECRET)
    return {'stripe': ready, 'bank': ready and bool(settings.STRIPE_BANK_PAYMENT_METHOD_TYPES),
            'crypto': bool(settings.COINBASE_COMMERCE_API_KEY and settings.COINBASE_COMMERCE_WEBHOOK_SECRET)}


@api_view(['GET'])
@permission_classes([AllowAny])
def methods(request):
    return Response({'methods': available_methods(), 'currency': settings.PAYMENT_CURRENCY})


def create_checkout(request, cart, data):
    method = data['payment_method']
    if not available_methods()[method]:
        return Response({'error': 'This payment method is not configured.'}, status=503)
    try:
        with transaction.atomic():
            # Serialize checkout of a basket; lock all SKU rows in a stable order.
            Cart.objects.select_for_update().get(pk=cart.pk)
            items = list(cart.items.select_related('variant__product').order_by('variant_id'))
            if not items:
                return Response({'error': 'Cart is empty.'}, status=400)
            variants = {v.pk: v for v in Variant.objects.select_for_update().filter(
                pk__in=[i.variant_id for i in items]).order_by('pk')}
            for item in items:
                v = variants[item.variant_id]
                if not v.is_active or not v.product.is_active or v.stock < item.quantity:
                    return Response({'error': 'An item is unavailable or has insufficient stock.'}, status=400)
                item.variant = v
            prices = [(i.unit_price.quantize(Decimal('.01'), rounding=ROUND_HALF_UP), i) for i in items]
            subtotal = sum((price * i.quantity for price, i in prices), Decimal('0.00'))
            shipping = Decimal('0.00') if subtotal >= 20 else Decimal('3.99')
            order = Order.objects.create(**{k: v for k, v in data.items() if k != 'payment_method'},
                user=request.user if request.user.is_authenticated else None,
                payment_method=method, currency=settings.PAYMENT_CURRENCY,
                subtotal=subtotal, shipping_cost=shipping, total=subtotal + shipping)
            for price, item in prices:
                OrderItem.objects.create(order=order, variant=item.variant, sku=item.variant.sku,
                    product_name=item.variant.product.name, size=item.variant.size, shade=item.variant.shade,
                    quantity=item.quantity, unit_price=price, line_total=price * item.quantity)
                Variant.objects.filter(pk=item.variant_id).update(stock=F('stock') - item.quantity)
            success = settings.PAYMENT_FRONTEND_URL + '/checkout/success?order=' + order.order_number
            cancel = settings.PAYMENT_FRONTEND_URL + '/cart'
            if method in ('stripe', 'bank'):
                # Stripe decides method eligibility by currency, account and customer.
                # Bank methods must also be activated in the Stripe Dashboard.
                options = {'payment_method_types': settings.STRIPE_BANK_PAYMENT_METHOD_TYPES} if method == 'bank' else {}
                session = stripe.checkout.Session.create(**options, api_key=settings.STRIPE_SECRET_KEY,
                    mode='payment', customer_email=order.email,
                    client_reference_id=order.order_number,
                    metadata={'order_number': order.order_number},
                    line_items=[{'price_data': {'currency': order.currency,
                        'unit_amount': int(order.total * 100),
                        'product_data': {'name': 'Order ' + order.order_number}}, 'quantity': 1}],
                    success_url=success, cancel_url=cancel,
                    idempotency_key='order-' + order.order_number)
                order.payment_reference = session.id
                url = session.url
            else:
                response = requests.post('https://api.commerce.coinbase.com/charges',
                    headers={'X-CC-Api-Key': settings.COINBASE_COMMERCE_API_KEY,
                             'X-CC-Version': '2018-03-22'},
                    json={'name': 'Order ' + order.order_number,
                          'description': 'Beauty products', 'pricing_type': 'fixed_price',
                          'local_price': {'amount': str(order.total), 'currency': order.currency.upper()},
                          'metadata': {'order_number': order.order_number},
                          'redirect_url': success, 'cancel_url': cancel}, timeout=20)
                response.raise_for_status()
                charge = response.json()['data']
                order.payment_reference = charge['id']
                url = charge['hosted_url']
            order.save(update_fields=['payment_reference'])
            cart.items.all().delete()
            result = OrderSerializer(order, context={'request': request}).data
            result['payment_url'] = url
            return Response(result, status=201)
    except (stripe.StripeError, requests.RequestException, ValueError, KeyError):
        return Response({'error': 'Payment provider unavailable. Your basket was retained.'}, status=502)


@transaction.atomic
def settle(number, reference, paid, amount=None, currency=None):
    order = Order.objects.select_for_update().filter(order_number=number, payment_reference=reference).first()
    if not order or order.status != 'pending':
        return
    if paid:
        if amount is None or currency is None:
            return
        if Decimal(str(amount)) != order.total or currency.lower() != order.currency:
            return
        order.status = 'paid'
    else:
        for item in order.items.order_by('variant_id'):
            if item.variant_id:
                Variant.objects.filter(pk=item.variant_id).update(stock=F('stock') + item.quantity)
        order.status = 'cancelled'
    order.save(update_fields=['status', 'updated_at'])


@csrf_exempt
def stripe_webhook(request):
    if request.method != 'POST':
        return HttpResponse(status=405)
    if not settings.STRIPE_WEBHOOK_SECRET:
        return HttpResponse(status=503)
    try:
        event = stripe.Webhook.construct_event(request.body,
            request.headers.get('Stripe-Signature', ''), settings.STRIPE_WEBHOOK_SECRET)
    except (ValueError, stripe.SignatureVerificationError):
        return HttpResponse(status=400)
    obj = event['data']['object']
    kind = event['type']
    if kind in ('checkout.session.completed', 'checkout.session.async_payment_succeeded'):
        if obj.get('payment_status') == 'paid':
            settle(obj.get('client_reference_id'), obj['id'], True,
                   Decimal(obj['amount_total']) / 100, obj['currency'])
    elif kind in ('checkout.session.expired', 'checkout.session.async_payment_failed'):
        settle(obj.get('client_reference_id'), obj['id'], False)
    return HttpResponse(status=200)


@csrf_exempt
def crypto_webhook(request):
    if request.method != 'POST':
        return HttpResponse(status=405)
    secret = settings.COINBASE_COMMERCE_WEBHOOK_SECRET
    if not secret:
        return HttpResponse(status=503)
    signature = hmac.new(secret.encode(), request.body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, request.headers.get('X-CC-Webhook-Signature', '')):
        return HttpResponse(status=400)
    try:
        event = json.loads(request.body)['event']
        charge = event['data']
        number = charge['metadata']['order_number']
        if event['type'] == 'charge:confirmed':
            price = charge['pricing']['local']
            settle(number, charge['id'], True, price['amount'], price['currency'])
        elif event['type'] == 'charge:failed':
            settle(number, charge['id'], False)
    except (KeyError, ValueError, TypeError):
        return HttpResponse(status=400)
    return HttpResponse(status=200)
