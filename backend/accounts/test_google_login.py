import json
import time
from urllib.parse import parse_qs, urlparse
from unittest.mock import patch, Mock

from allauth.account.models import EmailAddress
from allauth.socialaccount.models import SocialAccount
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from .google_login import SESSION_KEY
from .models import UserProfile

User = get_user_model()


@override_settings(GOOGLE_OAUTH_CLIENT_ID='test-client.apps.googleusercontent.com',
                   GOOGLE_OAUTH_CLIENT_SECRET='test-secret',
                   GOOGLE_OAUTH_REDIRECT_URI='https://shop.example/auth/google/callback')
class GoogleLoginTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.exchange = patch('accounts.google_login.requests.post').start()
        self.addCleanup(patch.stopall)
        self.exchange.return_value = Mock()
        self.exchange.return_value.json.return_value = {'id_token': 'provider-token'}
        self.verify = patch('accounts.google_login.id_token.verify_oauth2_token').start()

    def start(self):
        response = self.client.get('/api/accounts/google/start/')
        self.assertEqual(response.status_code, 200)
        query = parse_qs(urlparse(response.data['authorization_url']).query)
        self.verify.return_value = {'sub': 'google-subject', 'email': 'NEW@example.com',
            'email_verified': True, 'nonce': query['nonce'][0], 'given_name': 'New'}
        return query

    def login(self, query):
        return self.client.post('/api/accounts/google/', {'code': 'google-code', 'state': query['state'][0]}, format='json')

    def test_availability_reports_only_enabled_flag(self):
        result = self.client.get('/api/accounts/auth/providers/')
        self.assertEqual(result.data, {'google': {'enabled': True}})
        self.assertNotIn('test-secret', result.content.decode())

    def test_missing_configuration_disables_google(self):
        for config in [{'GOOGLE_OAUTH_CLIENT_ID': ''}, {'GOOGLE_OAUTH_CLIENT_SECRET': ''},
                       {'GOOGLE_OAUTH_REDIRECT_URI': ''},
                       {'GOOGLE_OAUTH_REDIRECT_URI': 'http://untrusted.example/callback'}]:
            with self.subTest(config=config), self.settings(**config):
                self.assertFalse(self.client.get('/api/accounts/auth/providers/').data['google']['enabled'])
                self.assertEqual(self.client.get('/api/accounts/google/start/').status_code, 503)
                self.assertEqual(self.client.post('/api/accounts/google/', {}).status_code, 503)
        self.exchange.assert_not_called()

    def test_start_requests_state_nonce_and_pkce(self):
        query = self.start()
        self.assertEqual(query['code_challenge_method'], ['S256'])
        self.assertEqual(query['scope'], ['openid email profile'])
        self.assertTrue(query['state'][0])
        self.assertNotIn('client_secret', query)
        self.assertEqual(self.client.get('/api/accounts/google/start/')['Cache-Control'], 'no-store')

    def test_new_login_creates_verified_user_profile_and_jwt(self):
        query = self.start()
        response = self.login(query)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data['access'])
        self.assertTrue(response.cookies['refresh']['httponly'])
        user = User.objects.get(email='new@example.com')
        self.assertFalse(user.has_usable_password())
        self.assertFalse(user.is_staff)
        self.assertTrue(UserProfile.objects.filter(user=user).exists())
        self.assertTrue(EmailAddress.objects.get(user=user).verified)
        self.assertEqual(SocialAccount.objects.get(user=user).uid, 'google-subject')
        call = self.exchange.call_args.kwargs['data']
        self.assertTrue(call['code_verifier'])
        self.assertEqual(call['redirect_uri'], 'https://shop.example/auth/google/callback')
        self.client.credentials(HTTP_AUTHORIZATION='Bearer ' + response.data['access'])
        self.assertEqual(self.client.get('/api/accounts/me/').data['id'], user.pk)

    def test_existing_linked_google_user_logs_in_without_duplicate(self):
        user = User.objects.create_user(email='new@example.com')
        SocialAccount.objects.create(user=user, provider='google', uid='google-subject')
        self.assertEqual(self.login(self.start()).status_code, 200)
        self.assertEqual(User.objects.count(), 1)

    def test_existing_password_account_is_not_automatically_linked(self):
        User.objects.create_user(email='new@example.com', password='Existing-password-99!')
        response = self.login(self.start())
        self.assertEqual(response.status_code, 400)
        self.assertEqual(SocialAccount.objects.count(), 0)
        self.assertEqual(User.objects.count(), 1)

    def test_missing_wrong_and_cross_session_state_are_rejected(self):
        self.assertEqual(self.client.post('/api/accounts/google/', {'code': 'x', 'state': 'wrong'}).status_code, 400)
        query = self.start()
        stranger = APIClient()
        self.assertEqual(stranger.post('/api/accounts/google/', {'code': 'x', 'state': query['state'][0]}).status_code, 400)
        self.assertEqual(self.client.post('/api/accounts/google/', {'code': 'x', 'state': 'wrong'}).status_code, 400)
        self.exchange.assert_not_called()

    def test_state_expires(self):
        query = self.start()
        session = self.client.session
        attempt = session[SESSION_KEY]
        attempt['created'] = time.time() - 601
        session[SESSION_KEY] = attempt
        session.save()
        self.assertEqual(self.login(query).status_code, 400)
        self.exchange.assert_not_called()

    def test_state_cannot_be_replayed(self):
        query = self.start()
        self.assertEqual(self.login(query).status_code, 200)
        self.assertEqual(self.login(query).status_code, 400)
        self.assertEqual(self.exchange.call_count, 1)

    def test_nonce_mismatch_is_rejected(self):
        query = self.start()
        self.verify.return_value['nonce'] = 'wrong'
        self.assertEqual(self.login(query).status_code, 400)
        self.assertEqual(User.objects.count(), 0)

    def test_unverified_or_missing_identity_is_rejected(self):
        for field, value in [('email_verified', False), ('email', ''), ('sub', '')]:
            with self.subTest(field=field):
                query = self.start()
                self.verify.return_value[field] = value
                self.assertEqual(self.login(query).status_code, 400)
        self.assertEqual(User.objects.count(), 0)

    def test_failed_token_verification_is_rejected(self):
        query = self.start()
        self.verify.side_effect = ValueError('invalid audience/signature/expiry')
        self.assertEqual(self.login(query).status_code, 400)
        self.assertEqual(User.objects.count(), 0)

    def test_provider_outage_does_not_create_account(self):
        import requests
        query = self.start()
        self.exchange.side_effect = requests.Timeout()
        self.assertEqual(self.login(query).status_code, 400)
        self.assertEqual(User.objects.count(), 0)

    def test_banned_linked_account_cannot_login(self):
        user = User.objects.create_user(email='new@example.com', is_banned=True)
        SocialAccount.objects.create(user=user, provider='google', uid='google-subject')
        response = self.login(self.start())
        self.assertEqual(response.status_code, 400)
        self.assertNotIn('access', response.data)


class GoogleSignatureTests(TestCase):
    """Exercise real signature/audience/expiry verification with local RSA keys."""
    def test_real_id_token_verification_rejects_tampering_and_wrong_claims(self):
        import jwt
        from google.auth.exceptions import GoogleAuthError
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        from google.oauth2.id_token import verify_oauth2_token
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        public = key.public_key().public_bytes(serialization.Encoding.PEM,
                                               serialization.PublicFormat.SubjectPublicKeyInfo).decode()
        transport = Mock(return_value=Mock(status=200, data=json.dumps({'test-key': public}).encode()))
        claims = {'iss': 'https://accounts.google.com', 'aud': 'test-client',
                  'sub': 'subject', 'iat': int(time.time()), 'exp': int(time.time()) + 300}
        token = jwt.encode(claims, key, algorithm='RS256', headers={'kid': 'test-key'})
        self.assertEqual(verify_oauth2_token(token, transport, 'test-client')['sub'], 'subject')
        for changes in [{'aud': 'wrong-client'}, {'iss': 'https://attacker.example'},
                        {'exp': int(time.time()) - 300}]:
            with self.subTest(changes=changes):
                invalid = jwt.encode({**claims, **changes}, key, algorithm='RS256', headers={'kid': 'test-key'})
                with self.assertRaises((ValueError, GoogleAuthError)):
                    verify_oauth2_token(invalid, transport, 'test-client')
        other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        invalid = jwt.encode(claims, other_key, algorithm='RS256', headers={'kid': 'test-key'})
        with self.assertRaises((ValueError, GoogleAuthError)):
            verify_oauth2_token(invalid, transport, 'test-client')
