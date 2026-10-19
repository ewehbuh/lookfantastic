"""Session ownership and stock-aware basket merging."""
from django.contrib.auth import get_user_model
from django.db import transaction
from products.catalogue import visible_products
from products.models import Variant
from .models import Cart, CartItem

MAX_QUANTITY = 10000


@transaction.atomic
def get_or_create_cart(request):
    if request.user.is_authenticated:
        # Serialise first basket creation and merging for this account.
        get_user_model().objects.select_for_update().get(pk=request.user.pk)
        cart, _ = Cart.objects.get_or_create(user=request.user)
        guest_id = request.session.get('guest_cart_id')
        guest_key = request.session.get('guest_cart_key', request.session.session_key)
        guests = Cart.objects.filter(user__isnull=True, session_key=guest_key)
        if guest_id:
            guests = guests.filter(pk=guest_id)
        guest = guests.first() if guest_key else None
        if guest and guest.pk != cart.pk:
            _merge_carts(guest, cart, request)
            guest.delete()
        request.session.pop('guest_cart_id', None)
        request.session.pop('guest_cart_key', None)
        return cart
    if not request.session.session_key:
        request.session.create()
    cart, _ = Cart.objects.get_or_create(user=None, session_key=request.session.session_key)
    # Django rotates session keys on login, but preserves these server-set markers.
    request.session['guest_cart_id'] = cart.pk
    request.session['guest_cart_key'] = cart.session_key
    return cart


@transaction.atomic
def _merge_carts(source_cart, target_cart, request):
    list(Cart.objects.select_for_update().filter(pk__in=[source_cart.pk, target_cart.pk]).order_by('pk'))
    items = list(source_cart.items.order_by('variant_id'))
    variants = {v.pk: v for v in Variant.objects.select_for_update().filter(
        pk__in=[item.variant_id for item in items], is_active=True,
        product__in=visible_products()).order_by('pk')}
    warnings = []
    for item in items:
        variant = variants.get(item.variant_id)
        if not variant or variant.stock == 0:
            warnings.append({'variant_id': item.variant_id, 'detail': 'Unavailable guest item was not merged.'})
            continue
        existing = target_cart.items.filter(variant_id=item.variant_id).first()
        requested = item.quantity + (existing.quantity if existing else 0)
        quantity = min(requested, variant.stock, MAX_QUANTITY)
        if quantity != requested:
            warnings.append({'variant_id': item.variant_id, 'detail': 'Merged quantity was limited to available stock.'})
        if existing:
            existing.quantity = quantity
            existing.save(update_fields=['quantity'])
        else:
            CartItem.objects.create(cart=target_cart, variant_id=item.variant_id, quantity=quantity)
    if source_cart.voucher_id and not target_cart.voucher_id:
        target_cart.voucher_id = source_cart.voucher_id
        target_cart.save(update_fields=['voucher'])
    request._cart_warnings = warnings
