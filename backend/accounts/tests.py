from datetime import timedelta
from urllib.parse import urlparse, parse_qs
import re

from django.contrib.auth import get_user_model
from django.core import mail
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from products.models import Brand, Product
from .models import UserProfile, WishlistItem, PointTransaction

User = get_user_model()
PASSWORD = 'Uncommon-Testing-Password-837!'


@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
class AccountTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(email='shopper@example.com', password=PASSWORD)
        self.other = User.objects.create_user(email='other@example.com', password=PASSWORD)
        self.staff = User.objects.create_user(email='staff@example.com', password=PASSWORD, is_staff=True)
        self.root = User.objects.create_superuser(email='root@example.com', password=PASSWORD)

    def auth(self, user=None):
        self.client.force_authenticate(user or self.user)

    def test_register_creates_normalised_user_and_profile(self):
        response = self.client.post('/api/accounts/register/', {
            'email': 'New@Example.com', 'password1': PASSWORD, 'password2': PASSWORD,
            'first_name': 'New', 'is_staff': True, 'is_superuser': True}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        user = User.objects.get(email='new@example.com')
        self.assertTrue(user.check_password(PASSWORD))
        self.assertTrue(UserProfile.objects.filter(user=user).exists())
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)

    def test_registration_rejects_duplicate_email(self):
        response = self.client.post('/api/accounts/register/', {
            'email': 'SHOPPER@EXAMPLE.COM', 'password1': PASSWORD, 'password2': PASSWORD})
        self.assertEqual(response.status_code, 400)

    def test_registration_rejects_weak_or_mismatched_passwords(self):
        for first, second in [('123', '123'), (PASSWORD, 'different')]:
            with self.subTest(password_case=first == second):
                response = self.client.post('/api/accounts/register/', {
                    'email': 'new@example.com', 'password1': first, 'password2': second})
                self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.filter(email='new@example.com').exists())

    def test_login_returns_usable_jwt(self):
        response = self.client.post('/api/accounts/login/', {'email': self.user.email, 'password': PASSWORD})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.cookies['refresh'].value)
        self.assertTrue(response.cookies['refresh']['httponly'])
        self.client.credentials(HTTP_AUTHORIZATION='Bearer ' + response.data['access'])
        me = self.client.get('/api/accounts/me/')
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.data['id'], self.user.pk)
        self.assertNotIn('password', me.data)

    def test_login_rejects_invalid_credentials(self):
        response = self.client.post('/api/accounts/login/', {'email': self.user.email, 'password': 'wrong'})
        self.assertEqual(response.status_code, 400)

    def test_login_rejects_restricted_accounts(self):
        for field, value in [('is_banned', True), ('login_disabled', True),
                             ('banned_until', timezone.now() + timedelta(days=1)), ('is_active', False)]:
            with self.subTest(field=field):
                setattr(self.user, field, value)
                self.user.save()
                response = self.client.post('/api/accounts/login/', {'email': self.user.email, 'password': PASSWORD})
                self.assertEqual(response.status_code, 400)
                setattr(self.user, field, None if field == 'banned_until' else field == 'is_active')
                self.user.save()

    def test_private_endpoints_require_authentication(self):
        for route in ['me/', 'wishlist/', 'points/', 'points/balance/', 'admin/users/']:
            with self.subTest(route=route):
                self.assertEqual(self.client.get('/api/accounts/' + route).status_code, 401)

    def test_profile_update_cannot_change_privileges_or_email(self):
        self.auth()
        response = self.client.patch('/api/accounts/me/', {'first_name': 'Updated',
            'email': 'hijack@example.com', 'is_staff': True, 'is_superuser': True}, format='json')
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, 'Updated')
        self.assertEqual(self.user.email, 'shopper@example.com')
        self.assertFalse(self.user.is_staff)
        self.assertFalse(self.user.is_superuser)

    def test_points_balance_handles_users_created_outside_registration(self):
        self.auth()
        response = self.client.get('/api/accounts/points/balance/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['total_points'], 0)

    def test_points_are_private_and_read_only(self):
        own = PointTransaction.objects.create(user=self.user, points=10, type='earn', description='Own')
        foreign = PointTransaction.objects.create(user=self.other, points=99, type='earn', description='Other')
        self.auth()
        response = self.client.get('/api/accounts/points/')
        self.assertEqual([v['id'] for v in response.data['results']], [own.pk])
        self.assertEqual(self.client.get(f'/api/accounts/points/{foreign.pk}/').status_code, 404)
        self.assertEqual(self.client.post('/api/accounts/points/', {'points': 500}).status_code, 405)

    def test_shopper_cannot_select_another_points_balance(self):
        UserProfile.objects.get_or_create(user=self.other, defaults={'total_points': 99})
        self.auth()
        response = self.client.get(f'/api/accounts/points/balance/?user_id={self.other.pk}')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['total_points'], 0)

    def test_regular_user_cannot_manage_users(self):
        self.auth()
        self.assertEqual(self.client.get('/api/accounts/admin/users/').status_code, 403)
        self.assertEqual(self.client.patch(f'/api/accounts/admin/users/{self.other.pk}/',
            {'is_staff': True}, format='json').status_code, 403)

    def test_staff_cannot_escalate_privileges_or_modify_superusers(self):
        self.auth(self.staff)
        for target, payload in [(self.other, {'is_superuser': True}),
                                (self.other, {'is_staff': True}),
                                (self.root, {'is_active': False})]:
            with self.subTest(target=target.pk, payload=payload):
                self.assertEqual(self.client.patch(f'/api/accounts/admin/users/{target.pk}/',
                    payload, format='json').status_code, 403)

    def test_staff_can_suspend_customer(self):
        self.auth(self.staff)
        response = self.client.patch(f'/api/accounts/admin/users/{self.other.pk}/',
                                     {'is_banned': True}, format='json')
        self.assertEqual(response.status_code, 200)
        self.other.refresh_from_db()
        self.assertTrue(self.other.is_banned)

    def test_superuser_can_manage_roles(self):
        self.auth(self.root)
        response = self.client.patch(f'/api/accounts/admin/users/{self.other.pk}/',
                                     {'is_staff': True}, format='json')
        self.assertEqual(response.status_code, 200)
        self.other.refresh_from_db()
        self.assertTrue(self.other.is_staff)

    def test_password_recovery_round_trip_and_token_reuse(self):
        response = self.client.post('/api/accounts/password-reset/', {'email': self.user.email})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        link = re.search(r'https?://[^\s<>]+', mail.outbox[0].body).group(0)
        query = parse_qs(urlparse(link).query)
        self.assertEqual(set(query), {'uid', 'token'})
        payload = {'uid': query['uid'][0], 'token': query['token'][0],
                   'new_password1': PASSWORD + 'new', 'new_password2': PASSWORD + 'new'}
        response = self.client.post('/api/accounts/password-reset/confirm/', payload)
        self.assertEqual(response.status_code, 200, response.data)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(PASSWORD + 'new'))
        self.assertEqual(self.client.post('/api/accounts/password-reset/confirm/', payload).status_code, 400)

    def test_reset_unknown_email_does_not_disclose_account(self):
        response = self.client.post('/api/accounts/password-reset/', {'email': 'unknown@example.com'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 0)

    def test_invalid_reset_token_is_rejected(self):
        response = self.client.post('/api/accounts/password-reset/confirm/', {
            'uid': 'invalid', 'token': 'invalid', 'new_password1': PASSWORD, 'new_password2': PASSWORD})
        self.assertEqual(response.status_code, 400)

    def login(self):
        response = self.client.post('/api/accounts/login/', {'email': self.user.email, 'password': PASSWORD})
        self.assertEqual(response.status_code, 200)
        return response

    def test_refresh_uses_httponly_cookie_and_rotates_token(self):
        response = self.login()
        previous = response.cookies['refresh'].value
        response = self.client.post('/api/accounts/token/refresh/', {}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data['access'])
        self.assertTrue(response.cookies['refresh']['httponly'])
        self.assertNotEqual(response.cookies['refresh'].value, previous)
        response = self.client.post('/api/accounts/token/refresh/', {'refresh': previous})
        self.assertEqual(response.status_code, 401)

    def test_logout_clears_cookies_and_revokes_refresh(self):
        response = self.login()
        refresh = response.cookies['refresh'].value
        self.client.credentials(HTTP_AUTHORIZATION='Bearer ' + response.data['access'])
        response = self.client.post('/api/accounts/logout/', {}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.cookies['refresh'].value, '')
        self.client.credentials()
        response = self.client.post('/api/accounts/token/refresh/', {'refresh': refresh})
        self.assertEqual(response.status_code, 401)

    def test_missing_or_invalid_refresh_is_rejected(self):
        for payload in [{}, {'refresh': 'invalid'}]:
            self.assertEqual(self.client.post('/api/accounts/token/refresh/', payload).status_code, 401)

    def test_existing_jwt_and_refresh_reject_newly_banned_user(self):
        response = self.login()
        self.client.credentials(HTTP_AUTHORIZATION='Bearer ' + response.data['access'])
        self.user.is_banned = True
        self.user.save()
        self.assertEqual(self.client.get('/api/accounts/me/').status_code, 401)
        self.client.credentials()
        self.assertEqual(self.client.post('/api/accounts/token/refresh/', {}).status_code, 401)

    def test_expired_temporary_ban_allows_login(self):
        self.user.banned_until = timezone.now() - timedelta(seconds=1)
        self.user.save()
        self.login()

    def test_staff_can_explicitly_inspect_customer_balance(self):
        UserProfile.objects.create(user=self.other, total_points=50)
        self.auth(self.staff)
        response = self.client.get(f'/api/accounts/points/balance/?user_id={self.other.pk}')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['total_points'], 50)

    def test_staff_points_feed_remains_personal(self):
        PointTransaction.objects.create(user=self.other, points=30, type='earn', description='Private')
        self.auth(self.staff)
        self.assertEqual(self.client.get('/api/accounts/points/').data['count'], 0)

    def test_verification_key_confirms_email_and_rejects_invalid_key(self):
        from allauth.account.models import EmailAddress, EmailConfirmationHMAC
        email = EmailAddress.objects.create(user=self.user, email=self.user.email, primary=True)
        key = EmailConfirmationHMAC(email).key
        self.assertEqual(self.client.get(f'/api/accounts/confirm-email/{key}/').status_code, 200)
        response = self.client.post('/api/accounts/verify-email/', {'key': key})
        self.assertEqual(response.status_code, 200, response.data)
        email.refresh_from_db()
        self.assertTrue(email.verified)
        self.assertEqual(self.client.post('/api/accounts/verify-email/', {'key': 'invalid'}).status_code, 404)

    def test_password_change_requires_old_password(self):
        self.auth()
        route = '/api/accounts/password/change/'
        payload = {'new_password1': PASSWORD + 'new', 'new_password2': PASSWORD + 'new'}
        self.assertEqual(self.client.post(route, payload).status_code, 400)
        self.assertEqual(self.client.post(route, {**payload, 'old_password': 'wrong'}).status_code, 400)
        self.assertEqual(self.client.post(route, {**payload, 'old_password': PASSWORD}).status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(PASSWORD + 'new'))

    def test_inactive_user_does_not_receive_reset_email(self):
        self.user.is_active = False
        self.user.save()
        response = self.client.post('/api/accounts/password-reset/', {'email': self.user.email})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 0)

    def test_expired_password_reset_token_is_rejected(self):
        from allauth.account.forms import default_token_generator
        from allauth.account.utils import user_pk_to_url_str
        token = default_token_generator.make_token(self.user)
        with self.settings(PASSWORD_RESET_TIMEOUT=-1):
            response = self.client.post('/api/accounts/password-reset/confirm/', {
                'uid': user_pk_to_url_str(self.user), 'token': token,
                'new_password1': PASSWORD + 'new', 'new_password2': PASSWORD + 'new'})
        self.assertEqual(response.status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(PASSWORD))

    def test_staff_balance_rejects_malformed_and_missing_user(self):
        self.auth(self.staff)
        self.assertEqual(self.client.get('/api/accounts/points/balance/?user_id=invalid').status_code, 400)
        self.assertEqual(self.client.get('/api/accounts/points/balance/?user_id=999999').status_code, 404)

    def test_invalid_and_expired_access_tokens_are_rejected(self):
        from rest_framework_simplejwt.tokens import AccessToken
        token = AccessToken.for_user(self.user)
        token.set_exp(lifetime=timedelta(seconds=-1))
        for value in ['invalid', str(token)]:
            self.client.credentials(HTTP_AUTHORIZATION='Bearer ' + value)
            self.assertEqual(self.client.get('/api/accounts/me/').status_code, 401)

    def test_existing_session_rejects_newly_restricted_user(self):
        self.client.force_login(self.user)
        self.user.login_disabled = True
        self.user.save()
        self.assertEqual(self.client.get('/api/accounts/me/').status_code, 401)

    def test_browser_email_confirmation_requires_post_and_csrf(self):
        from allauth.account.models import EmailAddress, EmailConfirmationHMAC
        email = EmailAddress.objects.create(user=self.user, email=self.user.email, primary=True)
        key = EmailConfirmationHMAC(email).key
        client = APIClient(enforce_csrf_checks=True)
        route = f'/api/accounts/confirm-email/{key}/'
        self.assertEqual(client.get(route).status_code, 200)
        email.refresh_from_db()
        self.assertFalse(email.verified)
        self.assertEqual(client.post(route).status_code, 403)
        response = client.post(route, HTTP_X_CSRFTOKEN=client.cookies['csrftoken'].value)
        self.assertEqual(response.status_code, 302)
        email.refresh_from_db()
        self.assertTrue(email.verified)


class WishlistTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(email='one@example.com')
        self.other = User.objects.create_user(email='two@example.com')
        brand = Brand.objects.create(name='Brand', slug='brand')
        self.product = Product.objects.create(name='Cream', slug='cream', brand=brand)
        self.foreign = WishlistItem.objects.create(user=self.other, product=self.product)
        self.client.force_authenticate(self.user)

    def test_create_list_duplicate_and_delete(self):
        response = self.client.post('/api/accounts/wishlist/', {'product_id': self.product.pk})
        self.assertEqual(response.status_code, 201, response.data)
        item_id = response.data['id']
        self.assertEqual(self.client.post('/api/accounts/wishlist/', {'product_id': self.product.pk}).status_code, 400)
        listing = self.client.get('/api/accounts/wishlist/')
        self.assertEqual(len(listing.data['results']), 1)
        self.assertEqual(listing.data['results'][0]['product']['slug'], 'cream')
        self.assertEqual(self.client.delete(f'/api/accounts/wishlist/{item_id}/').status_code, 204)
        self.assertFalse(WishlistItem.objects.filter(pk=item_id).exists())

    def test_cannot_access_or_delete_another_users_item(self):
        route = f'/api/accounts/wishlist/{self.foreign.pk}/'
        self.assertEqual(self.client.get(route).status_code, 404)
        self.assertEqual(self.client.delete(route).status_code, 404)

    def test_staff_shopping_wishlist_is_still_private(self):
        self.user.is_staff = True
        self.user.save()
        response = self.client.get('/api/accounts/wishlist/')
        self.assertEqual(response.data['count'], 0)
        self.assertEqual(self.client.delete(f'/api/accounts/wishlist/{self.foreign.pk}/').status_code, 404)

    def test_invalid_and_missing_product_are_validation_errors(self):
        for payload in [{}, {'product_id': 'invalid'}, {'product_id': -1}]:
            with self.subTest(payload=payload):
                self.assertIn(self.client.post('/api/accounts/wishlist/', payload).status_code, [400, 404])

    def test_inactive_product_cannot_be_saved(self):
        self.product.is_active = False
        self.product.save()
        self.assertIn(self.client.post('/api/accounts/wishlist/', {'product_id': self.product.pk}).status_code, [400, 404])
