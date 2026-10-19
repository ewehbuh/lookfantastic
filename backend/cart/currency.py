"""Validated server-side FX quotes. All supported currencies use two decimal places."""
from decimal import Decimal, ROUND_HALF_UP
from django.conf import settings
from django.utils import timezone
from rest_framework import serializers, viewsets, permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from .models import ExchangeRate

SUPPORTED = ('gbp', 'eur', 'usd', 'cad', 'aud', 'chf', 'nzd', 'sgd', 'hkd')


def currency_code(value):
    if not isinstance(value, str) or value.lower() not in SUPPORTED:
        raise ValidationError({'currency': 'Unsupported currency.'})
    return value.lower()


def get_rate(currency=None):
    base = currency_code(settings.PAYMENT_CURRENCY)
    currency = currency_code(currency if currency is not None else base)
    if currency == base:
        return currency, Decimal('1'), None
    row = ExchangeRate.objects.filter(base_currency=base, currency=currency).first()
    now = timezone.now()
    if not row or not now - timezone.timedelta(seconds=settings.FX_MAX_AGE_SECONDS) <= row.as_of <= now:
        raise ValidationError({'currency': 'A current exchange rate is unavailable for this currency.'})
    return currency, row.rate, row.as_of


def convert(amount, rate):
    return (Decimal(amount) * rate).quantize(Decimal('.01'), rounding=ROUND_HALF_UP)


def price_quote(cart, currency=None):
    from products.promotions import quote_line
    from .vouchers import discount_for
    currency, rate, as_of = get_rate(currency)
    rows = [(item, quote_line(item.variant, item.quantity)) for item in cart.items.select_related('variant__product').order_by('variant_id')]
    base_subtotal = sum((q['line_total'] for _, q in rows), Decimal('0'))
    base_discount = discount_for(cart.voucher, base_subtotal)
    shipping = Decimal('0') if base_subtotal - base_discount >= 20 else Decimal('3.99')
    items = [dict(id=item.pk, unit_price=convert(q['unit_price'], rate), line_total=convert(q['line_total'], rate)) for item, q in rows]
    subtotal = sum((i['line_total'] for i in items), Decimal('0.00'))
    discount = min(subtotal, convert(base_discount, rate))
    shipping = convert(shipping, rate)
    return dict(currency=currency, base_currency=settings.PAYMENT_CURRENCY, exchange_rate=str(rate),
                exchange_rate_at=as_of, subtotal=subtotal, discount_amount=discount,
                shipping_cost=shipping, total=subtotal-discount+shipping, items=items)


class ExchangeRateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExchangeRate
        fields = ['id', 'base_currency', 'currency', 'rate', 'as_of']

    def validate_base_currency(self, value):
        return currency_code(value)

    def validate_currency(self, value):
        return currency_code(value)

    def validate(self, attrs):
        def value(key):
            return attrs.get(key, getattr(self.instance, key, None))
        if value('base_currency') == value('currency'):
            raise ValidationError('Base and quote currencies must differ.')
        if value('rate') is not None and value('rate') <= 0:
            raise ValidationError({'rate': 'Rate must be positive.'})
        if value('as_of') and value('as_of') > timezone.now():
            raise ValidationError({'as_of': 'Future rates are not accepted.'})
        return attrs


class AdminExchangeRateViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAdminUser]
    serializer_class = ExchangeRateSerializer
    queryset = ExchangeRate.objects.all().order_by('currency')


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def currencies(request):
    result = []
    for code in SUPPORTED:
        try:
            code, rate, as_of = get_rate(code)
        except ValidationError:
            continue
        result.append(dict(currency=code, rate=str(rate), as_of=as_of))
    response = Response(dict(base_currency=settings.PAYMENT_CURRENCY, currencies=result,
                             max_age_seconds=settings.FX_MAX_AGE_SECONDS))
    response['Cache-Control'] = 'no-store'
    return response
