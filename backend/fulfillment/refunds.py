"""Refund requests reserve funds before contacting the provider; retries reuse a key."""
from decimal import Decimal
import uuid
import stripe
from django.conf import settings
from django.db import transaction
from django.db.models import Sum
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from cart.models import Order
from .models import Refund, ReturnRequest


class RefundInput(serializers.Serializer):
    order_id = serializers.IntegerField(min_value=1)
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal('.01'))
    reason = serializers.CharField(max_length=500)
    idempotency_key = serializers.UUIDField()
    return_id = serializers.IntegerField(min_value=1, required=False)


@transaction.atomic
def reserve_refund(data, actor):
    order = Order.objects.select_for_update().filter(pk=data['order_id']).first()
    if not order:
        raise ValidationError({'order_id': 'Order is unavailable.'})
    previous = Refund.objects.filter(idempotency_key=data['idempotency_key']).first()
    if previous:
        if previous.order_id != order.pk or previous.amount != data['amount'] or previous.return_request_id != data.get('return_id'):
            raise ValidationError({'idempotency_key': 'This key belongs to a different request.'})
        return previous
    if order.status not in ['paid', 'processing', 'shipped']:
        raise ValidationError({'order_id': 'Only paid orders can be refunded.'})
    reserved = order.refunds.exclude(status='failed').aggregate(total=Sum('amount'))['total'] or Decimal('0')
    if reserved + data['amount'] > order.total:
        raise ValidationError({'amount': 'Refund exceeds the unrefunded order amount.'})
    returned = None
    if data.get('return_id'):
        returned = ReturnRequest.objects.filter(pk=data['return_id'], order=order, status__in=['approved', 'received']).first()
        if not returned:
            raise ValidationError({'return_id': 'Return is unavailable or not approved.'})
    return Refund.objects.create(order=order, return_request=returned, amount=data['amount'], currency=order.currency,
        reason=data['reason'], idempotency_key=data['idempotency_key'], created_by=actor,
        status='pending' if order.payment_method in ['stripe', 'bank'] else 'requires_manual')


@transaction.atomic
def confirm_refund(refund_id, reference, provider_status, amount, currency, payment_intent):
    refund = Refund.objects.select_for_update().filter(pk=refund_id).first()
    if not refund:
        return False
    order = Order.objects.select_for_update().get(pk=refund.order_id)
    if Refund.objects.filter(provider_reference=reference).exclude(pk=refund.pk).exists():
        return False
    if (not reference or refund.provider_reference not in [None, reference] or
            Decimal(str(amount)) != refund.amount or currency.lower() != refund.currency or
            not payment_intent or payment_intent != order.payment_intent_id):
        return False
    if refund.status in ['succeeded', 'failed', 'requires_manual']:
        return True
    refund.provider_reference = reference
    if provider_status == 'succeeded':
        refund.status = 'succeeded'
        order.refunded_amount += refund.amount
        if order.refunded_amount == order.total:
            order.status = 'refunded'
        order.save(update_fields=['refunded_amount', 'status', 'updated_at'])
    elif provider_status in ['failed', 'canceled']:
        refund.status = 'failed'
    refund.save(update_fields=['status', 'provider_reference'])
    return True


def dispatch_refund(refund):
    if refund.status != 'pending':
        return refund
    if not settings.STRIPE_SECRET_KEY:
        return refund
    order = refund.order
    try:
        if not order.payment_intent_id:
            session = stripe.checkout.Session.retrieve(order.payment_reference, api_key=settings.STRIPE_SECRET_KEY)
            if (session.get('client_reference_id') != order.order_number or session.get('payment_status') != 'paid' or
                    session.get('amount_total') != int(order.total * 100) or session.get('currency') != order.currency):
                return refund
            intent = session.get('payment_intent')
            if not intent:
                return refund
            Order.objects.filter(pk=order.pk, payment_intent_id='').update(payment_intent_id=intent)
            order.refresh_from_db()
        result = stripe.Refund.create(api_key=settings.STRIPE_SECRET_KEY, payment_intent=order.payment_intent_id,
            amount=int(refund.amount * 100), metadata={'refund_id': str(refund.pk)},
            idempotency_key='refund-' + str(refund.idempotency_key))
        confirm_refund(refund.pk, result.id, result.status, Decimal(result.amount) / 100,
                       result.currency, result.payment_intent)
    except (stripe.StripeError, ValueError, KeyError):
        # Unknown outcomes stay pending and reserve capacity. Retry the SAME key.
        pass
    refund.refresh_from_db()
    return refund


def handle_refund_event(obj):
    try:
        refund_id = int(obj.get('metadata', {}).get('refund_id', ''))
        return confirm_refund(refund_id, obj['id'], obj['status'], Decimal(obj['amount']) / 100,
                              obj['currency'], obj.get('payment_intent'))
    except (ValueError, KeyError, TypeError):
        return False
