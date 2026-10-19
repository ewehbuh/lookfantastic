"""Best single automatic offer per SKU line; vouchers apply afterwards."""
from decimal import Decimal, ROUND_HALF_UP
from django.db.models import Q, F, OuterRef, Exists, CharField, ExpressionWrapper
from django.utils import timezone
from .models import Offer, ProductOffer


def money(value):
    return max(Decimal(value), Decimal('0')).quantize(Decimal('.01'), rounding=ROUND_HALF_UP)


def applicable_offers(product):
    now = timezone.now()
    categories = [*product.category.get_ancestors().values_list('pk', flat=True), product.category_id] if product.category_id else []
    return Offer.objects.filter(is_active=True, valid_from__lte=now, valid_to__gte=now).filter(
        Q(products=product) | Q(brands=product.brand_id) | Q(categories__in=categories)).distinct()


def quote_line(variant, quantity):
    base = money(variant.price)
    best = {'unit_price': base, 'line_total': money(base * quantity), 'offer_id': None}
    for offer in applicable_offers(variant.product).order_by('pk'):
        override = ProductOffer.objects.filter(product=variant.product, offer=offer).first()
        value = override.additional_value if override and override.additional_value is not None else offer.value
        unit = base
        if offer.offer_type == 'percentage':
            unit = money(base * (1 - max(Decimal('0'), min(value, Decimal('100'))) / 100))
            total = money(unit * quantity)
        elif offer.offer_type == 'fixed':
            unit = money(base - max(value, Decimal('0')))
            total = money(unit * quantity)
        elif offer.offer_type == 'buy_x_get_y' and offer.buy_quantity > 0 and offer.free_quantity > 0:
            free = quantity // (offer.buy_quantity + offer.free_quantity) * offer.free_quantity
            total = money(base * (quantity - free))
        else:
            continue
        if total < best['line_total']:
            best = {'unit_price': unit, 'line_total': total, 'offer_id': offer.pk}
    return best


def filter_on_offer(queryset, value):
    now = timezone.now()
    offers = Offer.objects.filter(is_active=True, valid_from__lte=now, valid_to__gte=now).annotate(
        product_path=ExpressionWrapper(OuterRef('category__path'), output_field=CharField())
    ).filter(Q(products=OuterRef('pk')) | Q(brands=OuterRef('brand_id')) |
             Q(product_path__startswith=F('categories__path')))
    return queryset.filter(Exists(offers)) if value else queryset.filter(~Exists(offers))
