import hashlib
import hmac
import json
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch, Mock

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from products.models import Brand, Category, Product, Variant
from .models import Cart, CartItem, Order
from .payments import settle


@override_settings(STRIPE_SECRET_KEY='test-placeholder', STRIPE_WEBHOOK_SECRET='test-signing',
                   COINBASE_COMMERCE_API_KEY='test-placeholder',
                   COINBASE_COMMERCE_WEBHOOK_SECRET='test-crypto-signing',
                   STRIPE_BANK_PAYMENT_METHOD_TYPES=['sepa_debit'],
                   PAYMENT_CURRENCY='gbp', PAYMENT_FRONTEND_URL='https://shop.example')
class PaymentTests(TestCase):
    def setUp(self):
        user = get_user_model().objects.create_user(email='shopper@example.com', password='testpassword')
        self.client = APIClient()
        self.client.force_authenticate(user)
        category = Category.add_root(name='Skincare', slug='skincare')
        brand = Brand.objects.create(name='Brand', slug='brand')
        product = Product.objects.create(name='Cream', slug='cream', brand=brand, category=category)
        self.variant = Variant.objects.create(product=product, sku='cream', price='10.00', stock=5)
        self.cart = Cart.objects.create(user=user)
        CartItem.objects.create(cart=self.cart, variant=self.variant, quantity=2)
        self.shipping = dict(email=user.email, shipping_name='Test Shopper', shipping_address='1 Street',
                             shipping_city='London', shipping_postcode='SW1A 1AA', shipping_country='GB')

    def checkout(self, method='stripe'):
        return self.client.post('/api/cart/checkout/', {**self.shipping, 'payment_method': method}, format='json')

    @patch('cart.payments.stripe.checkout.Session.create')
    def test_stripe_uses_server_total_and_reserves_stock(self, create):
        create.return_value = SimpleNamespace(id='cs_test', url='https://checkout.stripe.com/test')
        result = self.client.post('/api/cart/checkout/', {**self.shipping, 'total': '0.01'}, format='json')
        self.assertEqual(result.status_code, 201)
        self.assertEqual(create.call_args.kwargs['line_items'][0]['price_data']['unit_amount'], 2000)
        self.assertEqual(Order.objects.get().status, 'pending')
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock, 3)
        self.assertEqual(self.cart.items.count(), 0)
        self.assertEqual(result.data['payment_url'], create.return_value.url)

    @override_settings(STRIPE_SECRET_KEY='')
    def test_missing_credentials_preserve_basket(self):
        self.assertEqual(self.checkout().status_code, 503)
        self.assertEqual(Order.objects.count(), 0)
        self.assertTrue(self.cart.items.exists())

    @patch('cart.payments.stripe.checkout.Session.create')
    def test_provider_failure_rolls_back(self, create):
        import stripe
        create.side_effect = stripe.APIConnectionError('offline')
        self.assertEqual(self.checkout().status_code, 502)
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock, 5)
        self.assertTrue(self.cart.items.exists())
        self.assertEqual(Order.objects.count(), 0)

    def test_stock_is_rechecked(self):
        self.variant.stock = 1
        self.variant.save()
        self.assertEqual(self.checkout().status_code, 400)
        self.assertEqual(Order.objects.count(), 0)

    @patch('cart.payments.stripe.checkout.Session.create')
    def test_bank_uses_configured_bank_methods(self, create):
        create.return_value = SimpleNamespace(id='cs_bank', url='https://checkout.stripe.com/bank')
        self.assertEqual(self.checkout('bank').status_code, 201)
        self.assertEqual(create.call_args.kwargs['payment_method_types'], ['sepa_debit'])

    @patch('cart.payments.requests.post')
    def test_crypto_creates_hosted_charge(self, post):
        post.return_value = Mock()
        post.return_value.json.return_value = {'data': {'id': 'charge1', 'hosted_url': 'https://commerce.coinbase.com/test'}}
        self.assertEqual(self.checkout('crypto').status_code, 201)
        self.assertEqual(post.call_args.kwargs['json']['local_price']['amount'], '20.00')
        self.assertEqual(Order.objects.get().status, 'pending')

    def pending_order(self):
        return Order.objects.create(**self.shipping, subtotal='20.00', total='20.00', payment_reference='cs_test')

    def test_settlement_checks_amount_currency_reference(self):
        order = self.pending_order()
        for reference, amount, currency in [('wrong', '20', 'gbp'), ('cs_test', '1', 'gbp'), ('cs_test', '20', 'usd')]:
            settle(order.order_number, reference, True, amount, currency)
            order.refresh_from_db()
            self.assertEqual(order.status, 'pending')
        settle(order.order_number, 'cs_test', True, '20', 'gbp')
        settle(order.order_number, 'cs_test', True, '20', 'gbp')
        order.refresh_from_db()
        self.assertEqual(order.status, 'paid')

    @patch('cart.payments.stripe.checkout.Session.create')
    def test_expiry_restores_stock_only_once(self, create):
        create.return_value = SimpleNamespace(id='cs_test', url='https://checkout.stripe.com/test')
        self.checkout()
        order = Order.objects.get()
        settle(order.order_number, 'cs_test', False)
        settle(order.order_number, 'cs_test', False)
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock, 5)
        order.refresh_from_db()
        self.assertEqual(order.status, 'cancelled')

    def test_unsigned_webhooks_are_rejected(self):
        for provider in ['stripe', 'crypto']:
            result = self.client.post('/api/payments/' + provider + '/webhook/', {}, format='json')
            self.assertEqual(result.status_code, 400)

    def test_signed_crypto_confirmation(self):
        order = self.pending_order()
        body = json.dumps({'event': {'type': 'charge:confirmed', 'data': {'id': 'cs_test',
            'metadata': {'order_number': order.order_number},
            'pricing': {'local': {'amount': '20.00', 'currency': 'GBP'}}}}}).encode()
        signature = hmac.new(b'test-crypto-signing', body, hashlib.sha256).hexdigest()
        result = self.client.post('/api/payments/crypto/webhook/', body, content_type='application/json',
                                  HTTP_X_CC_WEBHOOK_SIGNATURE=signature)
        self.assertEqual(result.status_code, 200)
        order.refresh_from_db()
        self.assertEqual(order.status, 'paid')

    @patch('cart.payments.stripe.Webhook.construct_event')
    def test_unpaid_stripe_completion_waits_for_async_success(self, construct):
        order = self.pending_order()
        obj = {'id': 'cs_test', 'client_reference_id': order.order_number,
               'payment_status': 'unpaid', 'amount_total': 2000, 'currency': 'gbp'}
        construct.return_value = {'type': 'checkout.session.completed', 'data': {'object': obj}}
        self.client.post('/api/payments/stripe/webhook/', {}, format='json')
        order.refresh_from_db()
        self.assertEqual(order.status, 'pending')
        obj['payment_status'] = 'paid'
        construct.return_value['type'] = 'checkout.session.async_payment_succeeded'
        self.client.post('/api/payments/stripe/webhook/', {}, format='json')
        order.refresh_from_db()
        self.assertEqual(order.status, 'paid')
