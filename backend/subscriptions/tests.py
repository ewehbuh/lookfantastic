from datetime import datetime, timezone as dt_timezone
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from .models import SubscriptionPlan, UserSubscription, SubscriptionOrder
from .task import process_recurring_billing

User = get_user_model()


class SubscriptionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(email='one@example.com')
        self.other = User.objects.create_user(email='two@example.com')
        self.staff = User.objects.create_user(email='staff@example.com', is_staff=True)
        self.plan = SubscriptionPlan.objects.create(name='Beauty Box', slug='beauty-box',
            description='Monthly products', features='<p>Five products</p>', price='20.00')
        self.inactive = SubscriptionPlan.objects.create(name='Inactive', slug='inactive',
            price='10.00', is_active=False)

    def auth(self, user=None):
        self.client.force_authenticate(user or self.user)

    def subscription(self, user=None, plan=None, **kwargs):
        return UserSubscription.objects.create(user=user or self.user, plan=plan or self.plan, **kwargs)

    def test_public_plans_hide_inactive_and_are_read_only(self):
        response = self.client.get('/api/subscriptions/plans/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual([p['id'] for p in response.data['results']], [self.plan.pk])
        self.assertEqual(self.client.get(f'/api/subscriptions/plans/{self.inactive.pk}/').status_code, 404)
        self.assertEqual(self.client.post('/api/subscriptions/plans/', {}).status_code, 405)

    def test_private_endpoints_require_authentication(self):
        for route in ['my/', 'my/history/']:
            self.assertEqual(self.client.get('/api/subscriptions/' + route).status_code, 401)
        self.assertEqual(self.client.post('/api/subscriptions/my/subscribe/', {'plan_id': self.plan.pk}).status_code, 401)

    def test_subscribe_does_not_create_unpaid_subscriptions_or_award_points(self):
        from accounts.models import UserProfile, PointTransaction
        self.auth()
        response = self.client.post('/api/subscriptions/my/subscribe/', {'plan_id': self.plan.pk})
        self.assertEqual(response.status_code, 503)
        self.assertEqual(UserSubscription.objects.count(), 0)
        self.assertEqual(SubscriptionOrder.objects.count(), 0)
        self.assertEqual(PointTransaction.objects.count(), 0)
        self.assertFalse(UserProfile.objects.filter(user=self.user).exists())

    def test_subscribe_validates_plan_input_and_availability(self):
        self.auth()
        for payload in [{}, {'plan_id': 'invalid'}, {'plan_id': 0}]:
            self.assertEqual(self.client.post('/api/subscriptions/my/subscribe/', payload).status_code, 400)
        for plan_id in [self.inactive.pk, 999999]:
            self.assertEqual(self.client.post('/api/subscriptions/my/subscribe/', {'plan_id': plan_id}).status_code, 404)

    def test_duplicate_active_subscription_is_rejected(self):
        self.subscription()
        self.auth()
        response = self.client.post('/api/subscriptions/my/subscribe/', {'plan_id': self.plan.pk})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(UserSubscription.objects.count(), 1)

    def test_subscription_list_is_personal_even_for_staff(self):
        own = self.subscription()
        foreign = self.subscription(user=self.other)
        self.auth()
        self.assertEqual([s['id'] for s in self.client.get('/api/subscriptions/my/').data], [own.pk])
        self.auth(self.staff)
        self.assertEqual(self.client.get('/api/subscriptions/my/').data, [])
        self.assertEqual(self.client.post(f'/api/subscriptions/my/{foreign.pk}/cancel/').status_code, 404)

    def test_month_end_period_uses_calendar_month(self):
        start = datetime(2026, 1, 31, 12, tzinfo=dt_timezone.utc)
        sub = self.subscription(current_period_start=start)
        self.assertEqual(sub.current_period_end, datetime(2026, 2, 28, 12, tzinfo=dt_timezone.utc))
        self.assertEqual(sub.next_billing_date, sub.current_period_end)

    def test_quarter_year_and_interval_count_are_respected(self):
        start = datetime(2024, 2, 29, 12, tzinfo=dt_timezone.utc)
        for interval, count, expected in [('quarter', 2, datetime(2024, 8, 29, 12, tzinfo=dt_timezone.utc)),
                                          ('year', 1, datetime(2025, 2, 28, 12, tzinfo=dt_timezone.utc)),
                                          ('month', 3, datetime(2024, 5, 29, 12, tzinfo=dt_timezone.utc))]:
            with self.subTest(interval=interval, count=count):
                self.plan.interval = interval
                self.plan.interval_count = count
                self.plan.save()
                sub = self.subscription(current_period_start=start)
                self.assertEqual(sub.current_period_end, expected)

    def test_explicit_billing_dates_are_preserved(self):
        start = timezone.now()
        end = start + timezone.timedelta(days=12)
        bill = end + timezone.timedelta(days=5)
        sub = self.subscription(current_period_start=start, current_period_end=end, next_billing_date=bill)
        self.assertEqual(sub.current_period_end, end)
        self.assertEqual(sub.next_billing_date, bill)

    def test_skip_uses_plan_interval_without_creating_paid_order(self):
        self.plan.interval = 'quarter'
        self.plan.interval_count = 2
        self.plan.save()
        next_date = datetime(2026, 1, 31, 12, tzinfo=dt_timezone.utc)
        sub = self.subscription(next_billing_date=next_date)
        self.auth()
        response = self.client.post(f'/api/subscriptions/my/{sub.pk}/skip/')
        self.assertEqual(response.status_code, 200)
        sub.refresh_from_db()
        self.assertEqual(sub.next_billing_date, datetime(2026, 7, 31, 12, tzinfo=dt_timezone.utc))
        self.assertEqual(SubscriptionOrder.objects.count(), 0)

    def test_cancellation_is_idempotent_and_allows_paused_subscription(self):
        self.auth()
        for status in ['active', 'paused']:
            sub = self.subscription(status=status)
            route = f'/api/subscriptions/my/{sub.pk}/cancel/'
            self.assertEqual(self.client.post(route).status_code, 200)
            sub.refresh_from_db()
            cancelled = sub.cancelled_at
            self.assertIsNotNone(cancelled)
            self.assertEqual(sub.status, 'cancelled')
            self.assertEqual(self.client.post(route).status_code, 200)
            sub.refresh_from_db()
            self.assertEqual(sub.cancelled_at, cancelled)

    def test_skip_rejects_inactive_statuses_without_mutation(self):
        self.auth()
        for status in ['cancelled', 'paused', 'expired']:
            sub = self.subscription(status=status)
            original = sub.next_billing_date
            self.assertEqual(self.client.post(f'/api/subscriptions/my/{sub.pk}/skip/').status_code, 400)
            sub.refresh_from_db()
            self.assertEqual(sub.next_billing_date, original)

    def test_foreign_subscription_cannot_be_cancelled_or_skipped(self):
        sub = self.subscription(user=self.other)
        self.auth()
        for action in ['cancel', 'skip']:
            self.assertEqual(self.client.post(f'/api/subscriptions/my/{sub.pk}/{action}/').status_code, 404)
        sub.refresh_from_db()
        self.assertEqual(sub.status, 'active')

    def test_history_is_scoped_to_user_and_subscription_owner(self):
        own_sub = self.subscription()
        foreign_sub = self.subscription(user=self.other)
        own = SubscriptionOrder.objects.create(user=self.user, subscription=own_sub, amount='20')
        SubscriptionOrder.objects.create(user=self.other, subscription=foreign_sub, amount='20')
        SubscriptionOrder.objects.create(user=self.user, subscription=foreign_sub, amount='20')
        self.auth()
        response = self.client.get('/api/subscriptions/my/history/')
        self.assertEqual([o['id'] for o in response.data], [own.pk])

    def test_billing_task_never_fabricates_paid_orders(self):
        sub = self.subscription(next_billing_date=timezone.now() - timezone.timedelta(days=2))
        original = sub.next_billing_date
        result = process_recurring_billing.run()
        self.assertEqual(result['processed'], 0)
        self.assertEqual(SubscriptionOrder.objects.count(), 0)
        sub.refresh_from_db()
        self.assertEqual(sub.next_billing_date, original)

    def test_plan_features_are_safe_for_html_rendering(self):
        self.plan.features = '<p>Products</p><script>alert(1)</script><img src="x" onerror="bad()">'
        self.plan.save()
        result = self.client.get(f'/api/subscriptions/plans/{self.plan.pk}/')
        self.assertIn('<p>Products</p>', result.data['features'])
        self.assertNotIn('<script', result.data['features'])
        self.assertNotIn('onerror', result.data['features'])


class SubscriptionAdminTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.staff = User.objects.create_user(email='staff@example.com', is_staff=True)
        self.user = User.objects.create_user(email='shopper@example.com')
        self.plan = SubscriptionPlan.objects.create(name='Monthly', slug='monthly', price='20')
        self.sub = UserSubscription.objects.create(user=self.user, plan=self.plan)
        self.payload = {'name': 'Annual', 'slug': 'annual', 'description': 'Beauty products',
                        'features': '<p>Monthly boxes</p>', 'price': '100', 'interval': 'year', 'interval_count': 1}

    def test_management_requires_staff(self):
        routes = ['/api/subscriptions/admin/plans/', '/api/subscriptions/admin/subscriptions/',
                  '/api/subscriptions/admin/orders/', '/api/admin/plans/']
        for route in routes:
            self.assertEqual(self.client.get(route).status_code, 401)
        self.client.force_authenticate(self.user)
        for route in routes:
            self.assertEqual(self.client.get(route).status_code, 403)
            self.assertEqual(self.client.post(route, {}).status_code, 403)

    def test_frontend_plan_alias_supports_crud(self):
        self.client.force_authenticate(self.staff)
        response = self.client.post('/api/admin/plans/', self.payload)
        self.assertEqual(response.status_code, 201, response.data)
        route = f"/api/admin/plans/{response.data['id']}/"
        self.assertEqual(self.client.get(route).status_code, 200)
        self.assertEqual(self.client.patch(route, {'price': '110'}).status_code, 200)
        self.assertEqual(self.client.delete(route).status_code, 204)

    def test_plan_price_and_interval_count_are_validated(self):
        self.client.force_authenticate(self.staff)
        for values in [{'price': '-1'}, {'interval_count': 0}, {'interval_count': -1}, {'interval': 'week'}]:
            with self.subTest(values=values):
                response = self.client.post('/api/subscriptions/admin/plans/', {**self.payload, **values})
                self.assertEqual(response.status_code, 400)
        self.assertEqual(SubscriptionPlan.objects.count(), 1)

    def test_referenced_plan_deletion_returns_conflict(self):
        self.client.force_authenticate(self.staff)
        response = self.client.delete(f'/api/subscriptions/admin/plans/{self.plan.pk}/')
        self.assertEqual(response.status_code, 409)
        self.assertTrue(SubscriptionPlan.objects.filter(pk=self.plan.pk).exists())

    def test_staff_cannot_fabricate_subscription_creation(self):
        self.client.force_authenticate(self.staff)
        response = self.client.post('/api/subscriptions/admin/subscriptions/', {'user': self.user.pk,
            'plan': self.plan.pk, 'status': 'active'}, format='json')
        self.assertEqual(response.status_code, 405)
        self.assertEqual(UserSubscription.objects.count(), 1)

    def test_staff_cannot_fabricate_paid_orders(self):
        self.client.force_authenticate(self.staff)
        response = self.client.post('/api/subscriptions/admin/orders/', {'user': self.user.pk,
            'subscription': self.sub.pk, 'amount': '20', 'status': 'paid'}, format='json')
        self.assertEqual(response.status_code, 405)
        order = SubscriptionOrder.objects.create(user=self.user, subscription=self.sub, amount='20')
        self.assertEqual(self.client.patch(f'/api/subscriptions/admin/orders/{order.pk}/',
                                         {'status': 'paid'}, format='json').status_code, 405)
        order.refresh_from_db()
        self.assertEqual(order.status, 'pending')

    def test_staff_can_cancel_subscription_but_cannot_reactivate_it(self):
        self.client.force_authenticate(self.staff)
        route = f'/api/subscriptions/admin/subscriptions/{self.sub.pk}/'
        self.assertEqual(self.client.patch(route, {'status': 'cancelled'}, format='json').status_code, 200)
        self.sub.refresh_from_db()
        self.assertIsNotNone(self.sub.cancelled_at)
        self.assertEqual(self.client.patch(route, {'status': 'active'}, format='json').status_code, 400)

    def test_billing_dates_are_not_editable_through_admin_api(self):
        self.client.force_authenticate(self.staff)
        original = self.sub.next_billing_date
        response = self.client.patch(f'/api/subscriptions/admin/subscriptions/{self.sub.pk}/',
            {'next_billing_date': (original + timezone.timedelta(days=90)).isoformat()}, format='json')
        self.assertEqual(response.status_code, 200)
        self.sub.refresh_from_db()
        self.assertEqual(self.sub.next_billing_date, original)
