"""Google authorization-code login; enabled only with complete OAuth configuration."""
import base64
import hashlib
import secrets
import time
from urllib.parse import urlencode, urlsplit

import requests
from google.auth.exceptions import GoogleAuthError
from google.auth.transport.requests import Request
from google.oauth2 import id_token
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from allauth.account.models import EmailAddress
from allauth.socialaccount.models import SocialAccount
from dj_rest_auth.views import LoginView
from rest_framework import serializers
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.exceptions import APIException
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from .authentication import user_can_authenticate
from .models import UserProfile

SESSION_KEY = 'google_oauth_attempt'
MAX_AGE = 600


def enabled():
    try:
        uri = urlsplit(settings.GOOGLE_OAUTH_REDIRECT_URI)
    except ValueError:
        return False
    valid_uri = bool(uri.netloc and not uri.fragment and not uri.username and not uri.password
                     and (uri.scheme == 'https' or
                          uri.scheme == 'http' and uri.hostname in ('localhost', '127.0.0.1')))
    return bool(settings.GOOGLE_OAUTH_CLIENT_ID and settings.GOOGLE_OAUTH_CLIENT_SECRET and valid_uri)


class GoogleUnavailable(APIException):
    status_code = 503
    default_detail = 'Google login is not configured.'


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def providers(request):
    # The secret and authorization tokens are never exposed here.
    return Response({'google': {'enabled': enabled()}})


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def start(request):
    if not enabled():
        raise GoogleUnavailable()
    state, nonce, verifier = (secrets.token_urlsafe(32) for _ in range(3))
    request.session[SESSION_KEY] = {'state': state, 'nonce': nonce, 'verifier': verifier, 'created': time.time()}
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
    query = urlencode({'client_id': settings.GOOGLE_OAUTH_CLIENT_ID,
        'redirect_uri': settings.GOOGLE_OAUTH_REDIRECT_URI, 'response_type': 'code',
        'scope': 'openid email profile', 'state': state, 'nonce': nonce,
        'code_challenge': challenge, 'code_challenge_method': 'S256'})
    response = Response({'authorization_url': 'https://accounts.google.com/o/oauth2/v2/auth?' + query})
    response['Cache-Control'] = 'no-store'
    return response


class GoogleRequest(Request):
    def __call__(self, *args, **kwargs):
        kwargs['timeout'] = 15
        return super().__call__(*args, **kwargs)


class GoogleLoginSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=4096)
    state = serializers.CharField(max_length=256)

    def validate(self, attrs):
        if not enabled():
            raise GoogleUnavailable()
        request = self.context['request']
        attempt = request.session.pop(SESSION_KEY, None)
        if not attempt or not secrets.compare_digest(attempt['state'], attrs['state']):
            raise serializers.ValidationError('Invalid login state. Start Google login again.')
        if not 0 <= time.time() - attempt['created'] <= MAX_AGE:
            raise serializers.ValidationError('Google login expired. Start again.')
        try:
            response = requests.post('https://oauth2.googleapis.com/token', data={
                'code': attrs['code'], 'client_id': settings.GOOGLE_OAUTH_CLIENT_ID,
                'client_secret': settings.GOOGLE_OAUTH_CLIENT_SECRET,
                'redirect_uri': settings.GOOGLE_OAUTH_REDIRECT_URI,
                'grant_type': 'authorization_code', 'code_verifier': attempt['verifier']}, timeout=15)
            response.raise_for_status()
            credential = response.json()['id_token']
            # google-auth verifies signature, audience, expiry and Google issuer.
            claims = id_token.verify_oauth2_token(credential, GoogleRequest(), settings.GOOGLE_OAUTH_CLIENT_ID)
        except (requests.RequestException, GoogleAuthError, ValueError, KeyError, TypeError):
            raise serializers.ValidationError('Google could not verify this login. Start again.')
        if not secrets.compare_digest(str(claims.get('nonce', '')), attempt['nonce']):
            raise serializers.ValidationError('Invalid Google login nonce.')
        if (not claims.get('sub') or claims.get('email_verified') is not True
                or not claims.get('email')):
            raise serializers.ValidationError('A verified Google email address is required.')
        email = serializers.EmailField().run_validation(claims['email']).lower()
        User = get_user_model()
        try:
            with transaction.atomic():
                account = SocialAccount.objects.select_related('user').filter(provider='google', uid=claims['sub']).first()
                if account:
                    user = account.user
                else:
                    # Never link an existing password account by email alone.
                    if User.objects.filter(email__iexact=email).exists():
                        raise serializers.ValidationError('This email already has an account. Sign in using its existing login method.')
                    user = User.objects.create_user(email=email, password=None,
                        first_name=str(claims.get('given_name', ''))[:150],
                        last_name=str(claims.get('family_name', ''))[:150])
                    SocialAccount.objects.create(user=user, provider='google', uid=claims['sub'])
                    EmailAddress.objects.create(user=user, email=email, verified=True, primary=True)
                if not user_can_authenticate(user):
                    raise serializers.ValidationError('This account is restricted.')
                UserProfile.objects.get_or_create(user=user)
        except IntegrityError:
            raise serializers.ValidationError('An account already exists. Start login again.')
        return {'user': user}


class GoogleLoginView(LoginView):
    serializer_class = GoogleLoginSerializer
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request, *args, **kwargs):
        if not enabled():
            raise GoogleUnavailable()
        response = super().post(request, *args, **kwargs)
        response['Cache-Control'] = 'no-store'
        return response
