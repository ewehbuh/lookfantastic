from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch
import uuid
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from products.models import Brand, Product, Variant
from cart.models import Order, OrderItem
from cart.guest_orders import issue_token
from .models import Shipment, ShipmentEvent, ReturnRequest, Refund
from .refunds import confirm_refund


@override_settings(STRIPE_SECRET_KEY='test-key')
class FulfillmentTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        User = get_user_model()
        self.user = User.objects.create_user(email='one@example.com')
        self.other = User.objects.create_user(email='two@example.com')
        self.staff = User.objects.create_user(email='staff@example.com', is_staff=True)
        brand = Brand.objects.create(name='Brand', slug='brand')
        product = Product.objects.create(name='Cream', slug='cream', brand=brand)
        self.variant = Variant.objects.create(product=product, sku='cream', price='10', stock=5)
        self.order = Order.objects.create(user=self.user, email=self.user.email, subtotal='20', total='20', status='paid',
            payment_method='stripe', payment_reference='cs_test', payment_intent_id='pi_test', currency='gbp')
        self.item = OrderItem.objects.create(order=self.order, variant=self.variant, sku='cream', product_name='Cream',
            quantity=2, unit_price='10', line_total='20')

    def staff_auth(self):
        self.client.force_authenticate(self.staff)

    def test_order_details_and_tracking_are_owner_scoped(self):
        self.assertEqual(self.client.get('/api/orders/').status_code, 401)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(f'/api/orders/{self.order.order_number}/').status_code, 404)
        self.client.force_authenticate(self.user)
        response = self.client.get(f'/api/orders/{self.order.order_number}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['items'][0]['id'], self.item.pk)

    def test_shipping_requires_staff_paid_order_and_https_url(self):
        payload = {'order': self.order.pk, 'carrier': 'Carrier', 'tracking_number': 'TRACK', 'tracking_url': 'https://carrier.example/track'}
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.post('/api/admin/shipments/', payload).status_code, 403)
        self.staff_auth()
        self.assertEqual(self.client.post('/api/admin/shipments/', {**payload, 'tracking_url': 'http://bad.example'}).status_code, 400)
        self.order.status = 'pending'
        self.order.save()
        self.assertEqual(self.client.post('/api/admin/shipments/', payload).status_code, 400)

    def test_shipment_transitions_create_events_and_delivered_time(self):
        self.staff_auth()
        response = self.client.post('/api/admin/shipments/', {'order': self.order.pk, 'carrier': 'Carrier', 'tracking_number': 'TRACK'})
        self.assertEqual(response.status_code, 201, response.data)
        pk = response.data['id']
        route = f'/api/admin/shipments/{pk}/'
        self.assertEqual(self.client.patch(route, {'status': 'in_transit'}).status_code, 200)
        self.assertEqual(self.client.patch(route, {'status': 'delivered'}).status_code, 200)
        shipment = Shipment.objects.get(pk=pk)
        self.assertIsNotNone(shipment.delivered_at)
        self.assertEqual(shipment.events.count(), 3)
        self.assertEqual(self.client.patch(route, {'status': 'label_created'}).status_code, 400)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, 'shipped')
        self.client.force_authenticate(self.user)
        self.assertEqual(len(self.client.get(f'/api/orders/{self.order.order_number}/').data['shipments']), 1)

    def return_payload(self, **kwargs):
        return {'order_number': self.order.order_number, 'item_id': self.item.pk, 'quantity': 1, 'reason': 'Damaged', **kwargs}

    def test_return_requests_check_ownership_and_total_quantity(self):
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.post('/api/returns/', self.return_payload()).status_code, 400)
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.post('/api/returns/', self.return_payload(quantity=2)).status_code, 201)
        self.assertEqual(self.client.post('/api/returns/', self.return_payload()).status_code, 400)
        self.assertEqual(self.client.get('/api/returns/').data['count'], 1)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get('/api/returns/').data['count'], 0)

    def test_unpaid_expired_and_foreign_item_returns_are_rejected(self):
        self.client.force_authenticate(self.user)
        self.order.status = 'pending'
        self.order.save()
        self.assertEqual(self.client.post('/api/returns/', self.return_payload()).status_code, 400)
        self.order.status = 'paid'
        self.order.save()
        Order.objects.filter(pk=self.order.pk).update(created_at=timezone.now()-timezone.timedelta(days=31))
        self.assertEqual(self.client.post('/api/returns/', self.return_payload()).status_code, 400)
        Order.objects.filter(pk=self.order.pk).update(created_at=timezone.now())
        self.assertEqual(self.client.post('/api/returns/', self.return_payload(item_id=999999)).status_code, 400)

    def test_guest_return_requires_order_access_token(self):
        self.order.user = None
        self.order.save()
        token = issue_token(self.order)
        self.assertEqual(self.client.post('/api/returns/', self.return_payload()).status_code, 400)
        self.assertEqual(self.client.post('/api/returns/', self.return_payload(token=token)).status_code, 201)

    def test_return_receipt_restocks_only_once_and_requires_approval(self):
        returned = ReturnRequest.objects.create(order=self.order, item=self.item, quantity=1, reason='Damaged')
        self.staff_auth()
        self.assertEqual(self.client.post(f'/api/admin/returns/{returned.pk}/receive/', {'restock': True}).status_code, 400)
        self.assertEqual(self.client.patch(f'/api/admin/returns/{returned.pk}/', {'status': 'approved'}).status_code, 200)
        for _ in range(2):
            self.assertEqual(self.client.post(f'/api/admin/returns/{returned.pk}/receive/', {'restock': True}).status_code, 200)
        self.variant.refresh_from_db()
        self.assertEqual(self.variant.stock, 6)
        self.assertEqual(self.client.patch(f'/api/admin/returns/{returned.pk}/', {'status': 'closed'}).status_code, 400)

    def refund_payload(self, **kwargs):
        return {'order_id': self.order.pk, 'amount': '10', 'reason': 'Damaged', 'idempotency_key': str(uuid.uuid4()), **kwargs}

    def test_refund_requires_staff_and_rejects_unpaid_or_excessive_amounts(self):
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.post('/api/admin/refunds/', self.refund_payload()).status_code, 403)
        self.staff_auth()
        self.assertEqual(self.client.post('/api/admin/refunds/', self.refund_payload(amount='21')).status_code, 400)
        self.assertEqual(self.client.post('/api/admin/refunds/', self.refund_payload(amount='-1')).status_code, 400)
        self.order.status = 'pending'
        self.order.save()
        self.assertEqual(self.client.post('/api/admin/refunds/', self.refund_payload()).status_code, 400)

    @patch('fulfillment.refunds.stripe.Refund.create')
    def test_successful_stripe_refund_is_idempotent_and_preserves_inventory(self, create):
        create.return_value = SimpleNamespace(id='re_test', status='succeeded', amount=1000, currency='gbp', payment_intent='pi_test')
        self.staff_auth()
        payload = self.refund_payload()
        first = self.client.post('/api/admin/refunds/', payload)
        self.assertEqual(first.status_code, 200, first.data)
        second = self.client.post('/api/admin/refunds/', payload)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(create.call_count, 1)
        self.order.refresh_from_db()
        self.variant.refresh_from_db()
        self.assertEqual(self.order.refunded_amount, Decimal('10'))
        self.assertEqual(self.variant.stock, 5)
        self.assertEqual(self.client.post('/api/admin/refunds/', self.refund_payload(amount='11')).status_code, 400)
        self.assertEqual(self.client.patch(f"/api/admin/refunds/{first.data['id']}/", {'status': 'succeeded'}).status_code, 405)

    @patch('fulfillment.refunds.stripe.Refund.create')
    def test_timeout_stays_pending_and_retry_uses_same_provider_key(self, create):
        import stripe
        create.side_effect = stripe.APIConnectionError('timeout')
        self.staff_auth()
        payload = self.refund_payload()
        first = self.client.post('/api/admin/refunds/', payload)
        self.assertEqual(first.status_code, 202)
        self.assertEqual(first.data['status'], 'pending')
        key = create.call_args.kwargs['idempotency_key']
        create.side_effect = None
        create.return_value = SimpleNamespace(id='re_test', status='succeeded', amount=1000, currency='gbp', payment_intent='pi_test')
        self.assertEqual(self.client.post('/api/admin/refunds/', payload).status_code, 200)
        self.assertEqual(create.call_args.kwargs['idempotency_key'], key)
        self.assertEqual(Refund.objects.count(), 1)

    @patch('fulfillment.refunds.stripe.Refund.create')
    def test_full_refund_updates_order_and_rejects_wrong_provider_amount(self, create):
        create.return_value = SimpleNamespace(id='re_test', status='succeeded', amount=1900, currency='gbp', payment_intent='pi_test')
        self.staff_auth()
        response = self.client.post('/api/admin/refunds/', self.refund_payload(amount='20'))
        refund = Refund.objects.get()
        self.assertEqual(response.data['status'], 'pending')
        self.assertFalse(confirm_refund(refund.pk, 're_test', 'succeeded', '20', 'usd', 'pi_test'))
        self.assertTrue(confirm_refund(refund.pk, 're_test', 'succeeded', '20', 'gbp', 'pi_test'))
        self.assertTrue(confirm_refund(refund.pk, 're_test', 'succeeded', '20', 'gbp', 'pi_test'))
        self.order.refresh_from_db()
        self.assertEqual(self.order.refunded_amount, Decimal('20'))
        self.assertEqual(self.order.status, 'refunded')

    @patch('fulfillment.refunds.stripe.Refund.create')
    def test_crypto_refund_is_manual_and_never_marked_complete(self, create):
        self.order.payment_method = 'crypto'
        self.order.save()
        self.staff_auth()
        response = self.client.post('/api/admin/refunds/', self.refund_payload())
        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.data['status'], 'requires_manual')
        create.assert_not_called()
        self.order.refresh_from_db()
        self.assertEqual(self.order.refunded_amount, 0)

    @patch('cart.payments.stripe.Webhook.construct_event')
    def test_signed_refund_webhook_updates_matching_request_only(self, construct):
        refund = Refund.objects.create(order=self.order, amount='10', currency='gbp', reason='Damage', created_by=self.staff)
        construct.return_value = {'type': 'refund.updated', 'data': {'object': {'id': 're_test', 'status': 'succeeded',
            'amount': 1000, 'currency': 'gbp', 'payment_intent': 'pi_test', 'metadata': {'refund_id': str(refund.pk)}}}}
        with self.settings(STRIPE_WEBHOOK_SECRET='test-signing'):
            self.assertEqual(self.client.post('/api/payments/stripe/webhook/', {}, format='json').status_code, 200)
        refund.refresh_from_db()
        self.assertEqual(refund.status, 'succeeded')

    @patch('fulfillment.refunds.stripe.Refund.create')
    def test_failed_provider_refund_releases_capacity_and_reused_key_cannot_change_amount(self, create):
        create.return_value = SimpleNamespace(id='re_failed', status='failed', amount=2000, currency='gbp', payment_intent='pi_test')
        self.staff_auth()
        payload = self.refund_payload(amount='20')
        first = self.client.post('/api/admin/refunds/', payload)
        self.assertEqual(first.data['status'], 'failed')
        self.assertEqual(self.client.post('/api/admin/refunds/', {**payload, 'amount': '10'}).status_code, 400)
        create.return_value = SimpleNamespace(id='re_new', status='succeeded', amount=2000, currency='gbp', payment_intent='pi_test')
        self.assertEqual(self.client.post('/api/admin/refunds/', self.refund_payload(amount='20')).status_code, 200)
        self.order.refresh_from_db()
        self.assertEqual(self.order.refunded_amount, Decimal('20'))

    def test_second_shipment_label_does_not_downgrade_shipped_order(self):
        self.staff_auth()
        first = self.client.post('/api/admin/shipments/', {'order': self.order.pk, 'carrier': 'Carrier', 'tracking_number': 'ONE', 'status': 'in_transit'})
        self.assertEqual(first.status_code, 201)
        self.assertEqual(self.client.post('/api/admin/shipments/', {'order': self.order.pk, 'carrier': 'Carrier', 'tracking_number': 'TWO'}).status_code, 201)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, 'shipped')

    def test_guest_tracking_contains_only_accessible_order_and_return_actions_are_staff_only(self):
        self.order.user = None
        self.order.save()
        token = issue_token(self.order)
        Shipment.objects.create(order=self.order, carrier='Carrier', tracking_number='TRACK')
        response = self.client.post('/api/orders/guest-status/', {'order_number': self.order.order_number, 'token': token})
        self.assertEqual(len(response.data['shipments']), 1)
        returned = ReturnRequest.objects.create(order=self.order, item=self.item, quantity=1, reason='Damaged')
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.patch(f'/api/admin/returns/{returned.pk}/', {'status': 'approved'}).status_code, 403)
        self.assertEqual(self.client.post(f'/api/admin/returns/{returned.pk}/receive/', {'restock': True}).status_code, 403)


    def test_refund_admin_list_includes_order_and_audit_fields(self):
        refund = Refund.objects.create(order=self.order, amount='10', currency='gbp', reason='Damage', created_by=self.staff)
        self.staff_auth()
        result = self.client.get('/api/admin/refunds/')
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.data['results'][0]['order'], self.order.pk)
        self.assertEqual(result.data['results'][0]['created_by'], self.staff.pk)
        self.client.force_authenticate(self.user)
        public = self.client.get(f'/api/orders/{self.order.order_number}/').data['refunds'][0]
        self.assertNotIn('idempotency_key', public)
        self.assertNotIn('created_by', public)
