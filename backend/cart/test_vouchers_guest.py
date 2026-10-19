from decimal import Decimal
import hashlib
import re
from urllib.parse import urlparse, parse_qs
from types import SimpleNamespace
from unittest.mock import patch
from django.core import mail
from django.core.cache import cache
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from products.models import Brand, Product, Variant, Offer
from .models import Cart, CartItem, Voucher, Order, OrderAccessToken
from .guest_orders import issue_token
from .payments import settle


@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
                   STRIPE_SECRET_KEY='test-key', STRIPE_WEBHOOK_SECRET='test-signing')
class VouchersAndGuestTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(email='one@example.com')
        self.client.force_authenticate(self.user)
        brand = Brand.objects.create(name='Brand', slug='brand')
        product = Product.objects.create(name='Cream', slug='cream', brand=brand)
        self.variant = Variant.objects.create(product=product, sku='cream', price='10', stock=30)
        self.cart = Cart.objects.create(user=self.user)
        CartItem.objects.create(cart=self.cart, variant=self.variant, quantity=3)
        now = timezone.now()
        self.voucher = Voucher.objects.create(code='SAVE10', kind='percentage', value='10', max_uses=1,
            valid_from=now-timezone.timedelta(days=1), valid_to=now+timezone.timedelta(days=1))
        self.shipping = {'email': self.user.email, 'shipping_name': 'Shopper', 'shipping_address': 'Street',
                         'shipping_city': 'City', 'shipping_postcode': 'ABC', 'shipping_country': 'GB'}

    def test_voucher_apply_remove_and_invalid_code(self):
        self.assertEqual(self.client.post('/api/cart/voucher/', {'code': 'missing'}).status_code, 400)
        response = self.client.post('/api/cart/voucher/', {'code': 'save10'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['voucher']['discount_amount'], '3.00')
        self.assertEqual(self.client.delete('/api/cart/voucher/').status_code, 200)
        self.cart.refresh_from_db()
        self.assertIsNone(self.cart.voucher_id)

    @patch('cart.payments.stripe.checkout.Session.create')
    def test_checkout_uses_voucher_reserves_usage_and_expiry_releases_once(self, create):
        create.return_value = SimpleNamespace(id='cs_voucher', url='https://checkout.stripe.com/test')
        self.client.post('/api/cart/voucher/', {'code': 'SAVE10'})
        response = self.client.post('/api/cart/checkout/', self.shipping)
        self.assertEqual(response.status_code, 201, response.data)
        order = Order.objects.get()
        self.assertEqual(order.total, Decimal('27'))
        self.assertEqual(order.discount_amount, Decimal('3'))
        self.assertEqual(create.call_args.kwargs['line_items'][0]['price_data']['unit_amount'], 2700)
        self.voucher.refresh_from_db()
        self.assertEqual(self.voucher.used_count, 1)
        settle(order.order_number, 'cs_voucher', False)
        settle(order.order_number, 'cs_voucher', False)
        self.voucher.refresh_from_db()
        self.assertEqual(self.voucher.used_count, 0)

    @patch('cart.payments.stripe.checkout.Session.create')
    def test_provider_failure_rolls_back_usage_and_preserves_basket(self, create):
        import stripe
        create.side_effect = stripe.APIConnectionError('offline')
        self.client.post('/api/cart/voucher/', {'code': 'SAVE10'})
        self.assertEqual(self.client.post('/api/cart/checkout/', self.shipping).status_code, 502)
        self.voucher.refresh_from_db()
        self.assertEqual(self.voucher.used_count, 0)
        self.assertTrue(self.cart.items.exists())

    def test_voucher_limits_and_expiration_are_enforced_at_checkout(self):
        self.cart.voucher = self.voucher
        self.cart.save()
        self.voucher.used_count = 1
        self.voucher.save()
        self.assertFalse(self.client.get('/api/cart/').data['voucher']['valid'])
        self.assertEqual(self.client.post('/api/cart/checkout/', self.shipping).status_code, 400)
        self.voucher.used_count = 0
        self.voucher.valid_to = timezone.now()-timezone.timedelta(seconds=1)
        self.voucher.save()
        self.assertEqual(self.client.post('/api/cart/voucher/', {'code': 'SAVE10'}).status_code, 400)

    @patch('cart.payments.stripe.checkout.Session.create')
    def test_bogo_checkout_matches_basket_line_totals(self, create):
        create.return_value = SimpleNamespace(id='cs_bogo', url='https://checkout.stripe.com/test')
        now = timezone.now()
        offer = Offer.objects.create(name='BOGO', slug='bogo', offer_type='buy_x_get_y', value='0', buy_quantity=2,
            free_quantity=1, valid_from=now-timezone.timedelta(days=1), valid_to=now+timezone.timedelta(days=1))
        offer.products.add(self.variant.product)
        self.assertEqual(self.client.get('/api/cart/').data['total_price'], '20.00')
        result = self.client.post('/api/cart/checkout/', self.shipping)
        self.assertEqual(result.status_code, 201)
        self.assertEqual(Order.objects.get().items.get().line_total, Decimal('20'))
        self.assertEqual(Order.objects.get().total, Decimal('20'))

    def guest_order(self):
        return Order.objects.create(email='guest@example.com', subtotal='20', total='20', shipping_name='Guest')

    def test_guest_token_is_hashed_scoped_and_expires(self):
        self.client.force_authenticate(None)
        order = self.guest_order()
        token = issue_token(order)
        stored = OrderAccessToken.objects.get(order=order)
        self.assertNotEqual(stored.token_hash, token)
        self.assertEqual(stored.token_hash, hashlib.sha256(token.encode()).hexdigest())
        response = self.client.post('/api/orders/guest-status/', {'order_number': order.order_number, 'token': token})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Cache-Control'], 'no-store')
        self.assertEqual(self.client.post('/api/orders/guest-status/', {'order_number': 'OTHER', 'token': token}).status_code, 404)
        stored.expires_at = timezone.now()-timezone.timedelta(seconds=1)
        stored.save()
        self.assertEqual(self.client.post('/api/orders/guest-status/', {'order_number': order.order_number, 'token': token}).status_code, 404)

    def test_guest_access_request_has_generic_response_and_emails_only_matching_owner(self):
        self.client.force_authenticate(None)
        order = self.guest_order()
        unknown = self.client.post('/api/orders/guest-access/', {'order_number': order.order_number, 'email': 'wrong@example.com'})
        self.assertEqual(unknown.status_code, 202)
        self.assertEqual(len(mail.outbox), 0)
        matched = self.client.post('/api/orders/guest-access/', {'order_number': order.order_number, 'email': order.email})
        self.assertEqual(matched.data, unknown.data)
        self.assertEqual(len(mail.outbox), 1)
        link = re.search(r'https?://\S+', mail.outbox[0].body).group(0)
        query = parse_qs(urlparse(link).query)
        response = self.client.post('/api/orders/guest-status/', {'order_number': order.order_number, 'token': query['token'][0]})
        self.assertEqual(response.status_code, 200)

    def test_account_order_cannot_be_accessed_with_guest_token(self):
        order = Order.objects.create(user=self.user, email=self.user.email, subtotal='20', total='20')
        token = issue_token(order)
        self.assertEqual(self.client.post('/api/orders/guest-status/', {'order_number': order.order_number, 'token': token}).status_code, 404)

    def test_minimum_spend_and_fixed_discount_cap(self):
        self.voucher.kind = 'fixed'
        self.voucher.value = Decimal('100')
        self.voucher.min_subtotal = Decimal('40')
        self.voucher.save()
        self.assertEqual(self.client.post('/api/cart/voucher/', {'code': 'SAVE10'}).status_code, 400)
        self.voucher.min_subtotal = 0
        self.voucher.save()
        result = self.client.post('/api/cart/voucher/', {'code': 'SAVE10'})
        self.assertEqual(result.data['voucher']['discount_amount'], '30.00')

    def test_voucher_admin_permissions_and_validation(self):
        self.assertEqual(self.client.get('/api/admin/vouchers/').status_code, 403)
        self.user.is_staff = True
        self.user.save()
        now = timezone.now()
        payload = {'code': 'NEW', 'kind': 'percentage', 'value': '101',
                   'valid_from': now.isoformat(), 'valid_to': (now+timezone.timedelta(days=1)).isoformat()}
        self.assertEqual(self.client.post('/api/admin/vouchers/', payload).status_code, 400)
        payload['value'] = '10'
        response = self.client.post('/api/admin/vouchers/', payload)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(self.client.post('/api/admin/vouchers/', {**payload, 'code': 'new'}).status_code, 400)

    def test_saved_address_is_used_by_real_checkout(self):
        from accounts.models import Address
        address = Address.objects.create(user=self.user, full_name='Saved Name', line1='Saved Street',
                                         city='City', postcode='ABC', country='GB')
        with patch('cart.payments.stripe.checkout.Session.create', return_value=SimpleNamespace(id='cs_address', url='https://checkout.stripe.com/test')):
            response = self.client.post('/api/cart/checkout/', {'email': self.user.email, 'address_id': address.pk})
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Order.objects.get().shipping_address, 'Saved Street')
