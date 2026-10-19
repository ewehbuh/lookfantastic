"""Apply account restrictions to existing sessions and refreshed tokens too."""
from django.utils import timezone
from rest_framework.authentication import SessionAuthentication
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication


def user_can_authenticate(user):
    return bool(user and user.is_active and not user.is_banned and not user.login_disabled
                and (user.banned_until is None or user.banned_until <= timezone.now()))


class AccountJWTAuthentication(JWTAuthentication):
    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        if not user_can_authenticate(user):
            raise AuthenticationFailed('This account is restricted.')
        return user


class AccountSessionAuthentication(SessionAuthentication):
    def authenticate(self, request):
        result = super().authenticate(request)
        if result is not None and not user_can_authenticate(result[0]):
            raise AuthenticationFailed('This account is restricted.')
        return result
