from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch
from django.test import TestCase, override_settings
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from products.models import Brand, Product, Variant
from .models import ExchangeRate, Cart, CartItem, Order, Voucher
from .payments import settle


@override_settings(PAYMENT_CURRENCY='gbp', FX_MAX_AGE_SECONDS=86400,
                   STRIPE_SECRET_KEY='test', STRIPE_WEBHOOK_SECRET='test')
class CurrencyTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(email='fx@example.com')
        self.client.force_authenticate(self.user)
        brand = Brand.objects.create(name='Brand', slug='brand')
        product = Product.objects.create(name='Cream', slug='cream', brand=brand)
        self.variant = Variant.objects.create(product=product, sku='fx', price='10.01', stock=20)
        self.cart = Cart.objects.create(user=self.user)
        CartItem.objects.create(cart=self.cart, variant=self.variant, quantity=3)
        self.rate = ExchangeRate.objects.create(base_currency='gbp', currency='usd', rate='1.255', as_of=timezone.now())
        self.shipping = dict(email=self.user.email, shipping_name='Name', shipping_address='Street',
                             shipping_city='City', shipping_postcode='ABC', shipping_country='GB', currency='USD')

    def test_rates_only_expose_current_pairs(self):
        response = self.client.get('/api/currencies/')
        self.assertEqual({row['currency'] for row in response.data['currencies']}, {'gbp', 'usd'})
        self.rate.as_of -= timezone.timedelta(days=2)
        self.rate.save()
        self.assertEqual(len(self.client.get('/api/currencies/').data['currencies']), 1)

    def test_quote_rounds_lines_and_applies_base_shipping_threshold(self):
        response = self.client.get('/api/cart/quote/?currency=USD')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['subtotal'], Decimal('37.69'))
        self.assertEqual(response.data['shipping_cost'], 0)
        self.assertEqual(response.data['total'], sum(row['line_total'] for row in response.data['items']))
        self.assertEqual(self.client.get('/api/cart/').data['total_price'], '30.03')

    @patch('cart.payments.stripe.checkout.Session.create')
    def test_checkout_snapshot_provider_and_settlement(self, create):
        create.return_value = SimpleNamespace(id='cs_fx', url='https://checkout.stripe.com/test')
        quote = self.client.get('/api/cart/quote/?currency=usd').data
        response = self.client.post('/api/cart/checkout/', self.shipping)
        self.assertEqual(response.status_code, 201, response.data)
        order = Order.objects.get()
        self.assertEqual(order.total, quote['total'])
        self.assertEqual(order.items.get().line_total, order.subtotal)
        self.assertEqual(order.exchange_rate, Decimal('1.255'))
        self.assertEqual(order.base_currency, 'gbp')
        price = create.call_args.kwargs['line_items'][0]['price_data']
        self.assertEqual(price['currency'], 'usd')
        self.assertEqual(price['unit_amount'], 3769)
        self.rate.rate = 2
        self.rate.save()
        settle(order.order_number, 'cs_fx', True, order.total, 'gbp')
        order.refresh_from_db()
        self.assertEqual(order.status, 'pending')
        settle(order.order_number, 'cs_fx', True, order.total, 'usd')
        order.refresh_from_db()
        self.assertEqual(order.status, 'paid')
        self.assertEqual(order.exchange_rate, Decimal('1.255'))

    @patch('cart.payments.stripe.checkout.Session.create')
    def test_missing_stale_future_unsupported_rates_never_charge(self, create):
        for currency in ['eur', 'jpy', 'bad']:
            self.assertEqual(self.client.post('/api/cart/checkout/', {**self.shipping, 'currency': currency}).status_code, 400)
        for delta in [timezone.timedelta(days=-2), timezone.timedelta(days=1)]:
            self.rate.as_of = timezone.now() + delta
            self.rate.save()
            self.assertEqual(self.client.get('/api/cart/quote/?currency=usd').status_code, 400)
            self.assertEqual(self.client.post('/api/cart/checkout/', self.shipping).status_code, 400)
        create.assert_not_called()
        self.assertFalse(Order.objects.exists())
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock, 20)
        self.assertTrue(self.cart.items.exists())

    def test_fixed_voucher_and_shipping_are_converted(self):
        self.cart.items.update(quantity=1)
        now = timezone.now()
        voucher = Voucher.objects.create(code='FIXED', kind='fixed', value='2', valid_from=now-timezone.timedelta(days=1), valid_to=now+timezone.timedelta(days=1))
        self.cart.voucher = voucher
        self.cart.save()
        result = self.client.get('/api/cart/quote/?currency=usd').data
        self.assertEqual(result['discount_amount'], Decimal('2.51'))
        self.assertEqual(result['shipping_cost'], Decimal('5.01'))
        self.assertEqual(result['total'], result['subtotal']-result['discount_amount']+result['shipping_cost'])

    def test_rate_management_requires_staff_and_validates_inputs(self):
        url = '/api/admin/exchange-rates/'
        self.assertEqual(self.client.get(url).status_code, 403)
        self.user.is_staff = True
        self.user.save()
        data = dict(base_currency='GBP', currency='EUR', rate='1.2', as_of=timezone.now().isoformat())
        self.assertEqual(self.client.post(url, data).status_code, 201)
        for changes in [dict(rate='0'), dict(currency='jpy'), dict(currency='gbp'), dict(as_of=(timezone.now()+timezone.timedelta(days=1)).isoformat())]:
            self.assertEqual(self.client.post(url, {**data, **changes}).status_code, 400)

    @patch('fulfillment.refunds.stripe.Refund.create')
    def test_refund_uses_original_currency_after_rate_expires(self, refund_create):
        import uuid
        from fulfillment.refunds import reserve_refund, dispatch_refund
        order = Order.objects.create(user=self.user, email=self.user.email, shipping_name='Name',
            subtotal='37.69', total='37.69', currency='usd', base_currency='gbp',
            exchange_rate='1.255', status='paid', payment_intent_id='pi_fx')
        self.rate.delete()
        refund = reserve_refund(dict(order_id=order.pk, amount=Decimal('10.25'), reason='Return',
                                    idempotency_key=uuid.uuid4()), self.user)
        refund_create.return_value = SimpleNamespace(id='re_fx', status='succeeded', amount=1025,
                                                    currency='usd', payment_intent='pi_fx')
        refund = dispatch_refund(refund)
        self.assertEqual(refund.status, 'succeeded')
        self.assertEqual(refund.currency, 'usd')
        self.assertEqual(refund_create.call_args.kwargs['amount'], 1025)
        order.refresh_from_db()
        self.assertEqual(order.refunded_amount, Decimal('10.25'))
