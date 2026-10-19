from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from products.models import Brand, Product, Variant, Offer
from .models import Cart, CartItem, Order

User = get_user_model()


class BasketTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(email='one@example.com', password='Cart-password-99!')
        self.other = User.objects.create_user(email='two@example.com')
        self.brand = Brand.objects.create(name='Brand', slug='brand')
        self.product = Product.objects.create(name='Cream', slug='cream', brand=self.brand)
        self.variant = Variant.objects.create(product=self.product, sku='cream', price='10', stock=5)

    def add(self, quantity=1, client=None):
        return (client or self.client).post('/api/cart/add/', {'variant_id': self.variant.pk, 'quantity': quantity}, format='json')

    def test_guest_basket_persists_in_same_session(self):
        self.assertEqual(self.add(2).status_code, 201)
        response = self.client.get('/api/cart/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['total_items'], 2)
        self.assertEqual(response.data['total_price'], '20.00')
        self.assertEqual(response.data['items'][0]['variant']['product_name'], 'Cream')

    def test_guest_sessions_are_isolated(self):
        self.add(2)
        stranger = APIClient()
        self.assertEqual(stranger.get('/api/cart/').data['total_items'], 0)
        item = self.client.get('/api/cart/').data['items'][0]['id']
        self.assertEqual(stranger.delete('/api/cart/remove/', {'item_id': item}, format='json').status_code, 404)

    def test_real_login_session_rotation_preserves_and_merges_guest_basket_once(self):
        cart = Cart.objects.create(user=self.user)
        CartItem.objects.create(cart=cart, variant=self.variant, quantity=1)
        self.add(2)
        old_key = self.client.session.session_key
        result = self.client.post('/api/accounts/login/', {'email': self.user.email, 'password': 'Cart-password-99!'})
        self.assertEqual(result.status_code, 200)
        self.assertNotEqual(self.client.session.session_key, old_key)
        self.client.credentials(HTTP_AUTHORIZATION='Bearer ' + result.data['access'])
        response = self.client.get('/api/cart/')
        self.assertEqual(response.data['total_items'], 3)
        self.assertEqual(self.client.get('/api/cart/').data['total_items'], 3)
        self.assertEqual(Cart.objects.filter(user=None).count(), 0)

    def test_merge_caps_quantities_to_stock_and_reports_adjustment(self):
        target = Cart.objects.create(user=self.user)
        CartItem.objects.create(cart=target, variant=self.variant, quantity=4)
        self.add(3)
        self.client.force_authenticate(self.user)
        result = self.client.get('/api/cart/')
        self.assertEqual(result.data['total_items'], 5)
        self.assertTrue(result.data['warnings'])
        self.assertEqual(Cart.objects.filter(user=None).count(), 0)

    def test_merge_does_not_import_unavailable_guest_products(self):
        self.add()
        self.product.is_active = False
        self.product.save()
        self.client.force_authenticate(self.user)
        result = self.client.get('/api/cart/')
        self.assertEqual(result.data['total_items'], 0)
        self.assertTrue(result.data['warnings'])

    def test_another_users_cart_cannot_be_imported_via_session_markers(self):
        foreign = Cart.objects.create(user=self.other, session_key='foreign')
        CartItem.objects.create(cart=foreign, variant=self.variant, quantity=2)
        self.client.get('/api/cart/')
        session = self.client.session
        session['guest_cart_id'] = foreign.pk
        session['guest_cart_key'] = 'foreign'
        session.save()
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.get('/api/cart/').data['total_items'], 0)
        self.assertTrue(CartItem.objects.filter(cart=foreign).exists())

    def test_authenticated_user_has_only_one_cart(self):
        Cart.objects.create(user=self.user)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Cart.objects.create(user=self.user)

    def test_add_rejects_invalid_quantities_without_500(self):
        for quantity in ['wrong', None, True, 1.5, 0, -1, 10001]:
            with self.subTest(quantity=quantity):
                self.assertEqual(self.add(quantity).status_code, 400)
        self.assertEqual(CartItem.objects.count(), 0)

    def test_add_validates_variant_id(self):
        for payload in [{}, {'variant_id': 'wrong'}, {'variant_id': 0}]:
            self.assertEqual(self.client.post('/api/cart/add/', payload, format='json').status_code, 400)
        self.assertEqual(self.client.post('/api/cart/add/', {'variant_id': 999999}).status_code, 404)

    def test_repeated_add_checks_combined_stock(self):
        self.assertEqual(self.add(3).status_code, 201)
        self.assertEqual(self.add(3).status_code, 400)
        self.assertEqual(self.client.get('/api/cart/').data['total_items'], 3)
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock, 5)

    def test_hidden_product_brand_and_variant_cannot_be_added(self):
        for obj in [self.product, self.brand, self.variant]:
            with self.subTest(model=type(obj).__name__):
                obj.is_active = False
                obj.save()
                self.assertEqual(self.add().status_code, 404)
                obj.is_active = True
                obj.save()

    def test_update_requires_quantity_and_valid_item_id(self):
        self.add(2)
        item_id = self.client.get('/api/cart/').data['items'][0]['id']
        for payload in [{'item_id': item_id}, {'item_id': item_id, 'quantity': 'invalid'},
                        {'item_id': item_id, 'quantity': -1}, {'item_id': 'invalid', 'quantity': 1}]:
            self.assertEqual(self.client.patch('/api/cart/update-item/', payload, format='json').status_code, 400)
        self.assertEqual(self.client.get('/api/cart/').data['total_items'], 2)

    def test_update_zero_removes_item_and_excess_stock_is_rejected(self):
        self.add(2)
        item_id = self.client.get('/api/cart/').data['items'][0]['id']
        self.assertEqual(self.client.patch('/api/cart/update-item/', {'item_id': item_id, 'quantity': 6}).status_code, 400)
        self.assertEqual(self.client.patch('/api/cart/update-item/', {'item_id': item_id, 'quantity': 0}).status_code, 200)
        self.assertEqual(self.client.get('/api/cart/').data['total_items'], 0)

    def test_update_and_remove_cannot_mutate_other_users_items(self):
        foreign = Cart.objects.create(user=self.other)
        item = CartItem.objects.create(cart=foreign, variant=self.variant, quantity=2)
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.patch('/api/cart/update-item/', {'item_id': item.pk, 'quantity': 1}).status_code, 404)
        self.assertEqual(self.client.delete('/api/cart/remove/', {'item_id': item.pk}, format='json').status_code, 404)
        item.refresh_from_db()
        self.assertEqual(item.quantity, 2)

    def test_remove_validates_input_and_removes_owned_item(self):
        self.assertEqual(self.client.delete('/api/cart/remove/', {'item_id': 'wrong'}, format='json').status_code, 400)
        self.add()
        item_id = self.client.get('/api/cart/').data['items'][0]['id']
        self.assertEqual(self.client.delete('/api/cart/remove/', {'item_id': item_id}, format='json').status_code, 200)
        self.assertFalse(CartItem.objects.filter(pk=item_id).exists())

    def test_discount_rounding_matches_basket_line_and_total(self):
        self.variant.price = Decimal('0.05')
        self.variant.save()
        now = timezone.now()
        offer = Offer.objects.create(name='Half price', slug='half', offer_type='percentage', value='50',
            valid_from=now-timezone.timedelta(days=1), valid_to=now+timezone.timedelta(days=1))
        offer.products.add(self.product)
        data = self.add(3).data
        self.assertEqual(data['items'][0]['unit_price'], '0.03')
        self.assertEqual(data['items'][0]['line_total'], '0.09')
        self.assertEqual(data['total_price'], '0.09')

    def test_order_history_requires_authentication_and_is_personal(self):
        self.assertEqual(self.client.get('/api/cart/orders/').status_code, 401)
        def order(user):
            return Order.objects.create(user=user, email=user.email, subtotal='10', total='10',
                shipping_name='Test', shipping_address='Street', shipping_city='City',
                shipping_postcode='ABC', shipping_country='GB')
        own = order(self.user)
        order(self.other)
        self.client.force_authenticate(self.user)
        result = self.client.get('/api/cart/orders/')
        self.assertEqual([o['id'] for o in result.data], [own.pk])
        self.assertNotIn('payment_reference', result.data[0])

    def test_empty_checkout_does_not_create_order(self):
        self.assertEqual(self.client.post('/api/cart/checkout/', {}).status_code, 400)
        self.assertEqual(Order.objects.count(), 0)

    @override_settings(STRIPE_SECRET_KEY='placeholder', STRIPE_WEBHOOK_SECRET='placeholder')
    @patch('cart.payments.stripe.checkout.Session.create')
    def test_guest_checkout_returns_hosted_url_without_assigning_another_owner(self, create):
        create.return_value = SimpleNamespace(id='cs_guest', url='https://checkout.stripe.com/guest')
        self.add()
        response = self.client.post('/api/cart/checkout/', {'email': 'guest@example.com',
            'shipping_name': 'Guest', 'shipping_address': '1 Street', 'shipping_city': 'City',
            'shipping_postcode': 'ABC', 'shipping_country': 'GB', 'payment_method': 'stripe'}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        order = Order.objects.get()
        self.assertIsNone(order.user_id)
        self.assertEqual(order.total, Decimal('13.99'))
        self.assertEqual(order.status, 'pending')
        self.assertEqual(self.client.get('/api/cart/').data['total_items'], 0)

    def test_fixed_discount_never_makes_totals_negative(self):
        now = timezone.now()
        offer = Offer.objects.create(name='Discount', slug='discount', offer_type='fixed', value='50',
            valid_from=now-timezone.timedelta(days=1), valid_to=now+timezone.timedelta(days=1))
        offer.products.add(self.product)
        result = self.add(2)
        self.assertEqual(result.status_code, 201)
        self.assertEqual(result.data['items'][0]['unit_price'], '0.00')
        self.assertEqual(result.data['total_price'], '0.00')

    @override_settings(STRIPE_SECRET_KEY='placeholder', STRIPE_WEBHOOK_SECRET='placeholder')
    @patch('cart.payments.stripe.checkout.Session.create')
    def test_unavailable_basket_items_cannot_be_increased_or_checked_out(self, create):
        self.add()
        item_id = self.client.get('/api/cart/').data['items'][0]['id']
        self.brand.is_active = False
        self.brand.save()
        result = self.client.patch('/api/cart/update-item/', {'item_id': item_id, 'quantity': 2})
        self.assertEqual(result.status_code, 400)
        result = self.client.post('/api/cart/checkout/', {'email': 'guest@example.com',
            'shipping_name': 'Guest', 'shipping_address': 'Street', 'shipping_city': 'City',
            'shipping_postcode': 'ABC', 'shipping_country': 'GB'}, format='json')
        self.assertEqual(result.status_code, 400)
        create.assert_not_called()
        self.assertEqual(Order.objects.count(), 0)
        self.assertEqual(self.client.patch('/api/cart/update-item/', {'item_id': item_id, 'quantity': 0}).status_code, 200)

    @override_settings(STRIPE_SECRET_KEY='placeholder', STRIPE_WEBHOOK_SECRET='placeholder')
    @patch('cart.payments.stripe.checkout.Session.create')
    def test_oversized_total_is_rejected_before_provider_call(self, create):
        self.variant.price = Decimal('90000000.00')
        self.variant.save()
        cart = Cart.objects.create(user=self.user)
        CartItem.objects.create(cart=cart, variant=self.variant, quantity=2)
        self.client.force_authenticate(self.user)
        result = self.client.post('/api/cart/checkout/', {'email': self.user.email,
            'shipping_name': 'Shopper', 'shipping_address': 'Street', 'shipping_city': 'City',
            'shipping_postcode': 'ABC', 'shipping_country': 'GB'}, format='json')
        self.assertEqual(result.status_code, 400)
        create.assert_not_called()
        self.assertTrue(cart.items.exists())
        self.assertEqual(Order.objects.count(), 0)

    def test_logout_does_not_expose_account_basket_to_guest(self):
        cart = Cart.objects.create(user=self.user)
        CartItem.objects.create(cart=cart, variant=self.variant, quantity=2)
        login = self.client.post('/api/accounts/login/', {'email': self.user.email, 'password': 'Cart-password-99!'})
        self.assertEqual(login.status_code, 200)
        self.assertEqual(self.client.get('/api/cart/').data['total_items'], 2)
        self.assertEqual(self.client.post('/api/accounts/logout/').status_code, 200)
        self.assertEqual(self.client.get('/api/cart/').data['total_items'], 0)
        self.assertEqual(cart.items.get().quantity, 2)
