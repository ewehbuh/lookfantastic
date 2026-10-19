from rest_framework import serializers
from dj_rest_auth.registration.serializers import RegisterSerializer
from dj_rest_auth.serializers import LoginSerializer, PasswordResetSerializer
from django.contrib.auth import get_user_model
from django.contrib.sites.shortcuts import get_current_site
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.utils.html import strip_tags
from django.conf import settings
from allauth.account.utils import filter_users_by_email, user_email, user_pk_to_url_str
from allauth.account.forms import default_token_generator
from rest_framework_simplejwt.tokens import RefreshToken

from .models import UserProfile, WishlistItem, PointTransaction

User = get_user_model()


# ---------- Registration ----------
class CustomRegisterSerializer(RegisterSerializer):
    first_name = serializers.CharField(max_length=30, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=30, required=False, allow_blank=True)
    username = serializers.CharField(max_length=150, required=False, allow_blank=True)

    def validate_email(self, value):
        email = value.lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError("A user with this email address already exists.")
        return email

    def get_cleaned_data(self):
        data = super().get_cleaned_data()
        data['first_name'] = self.validated_data.get('first_name', '')
        data['last_name'] = self.validated_data.get('last_name', '')
        data['email'] = self.validated_data.get('email', '').lower()
        return data

    def save(self, request):
        user = super().save(request)
        UserProfile.objects.get_or_create(user=user)
        return user


# ---------- Login (with JWT tokens) ----------
# class CustomLoginSerializer(LoginSerializer):
#     def validate(self, attrs):
#         data = super().validate(attrs)
#         user = data['user']
#         from django.utils import timezone
#         if user.is_banned:
#             raise serializers.ValidationError("Your account has been suspended.")
#         if user.banned_until and user.banned_until > timezone.now():
#             raise serializers.ValidationError("Your account is temporarily suspended.")
#         if user.login_disabled:
#             raise serializers.ValidationError("Login is disabled for your account.")

#         refresh = RefreshToken.for_user(user)
#         data['access'] = str(refresh.access_token)
#         data['refresh'] = str(refresh)
#         return data


# ---------- User Serializer (regular user) ----------
class UserSerializer(serializers.ModelSerializer):
    profile = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ('id', 'email', 'first_name', 'last_name', 'is_staff', 'is_superuser', 'profile')
        read_only_fields = ('email', 'is_staff', 'is_superuser')

    def get_profile(self, obj):
        if hasattr(obj, 'profile'):
            return {
                'date_of_birth': obj.profile.date_of_birth,
                'phone': obj.profile.phone,
                'total_points': obj.profile.total_points,
            }
        return None

# ---------- Login (with JWT tokens) ----------
class CustomLoginSerializer(LoginSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        user = data['user']                # actual User model instance

        from django.utils import timezone
        if user.is_banned:
            raise serializers.ValidationError("Your account has been suspended.")
        if user.banned_until and user.banned_until > timezone.now():
            raise serializers.ValidationError("Your account is temporarily suspended.")
        if user.login_disabled:
            raise serializers.ValidationError("Login is disabled for your account.")

        # Add JWT tokens
        refresh = RefreshToken.for_user(user)
        data['access'] = str(refresh.access_token)
        data['refresh'] = str(refresh)

        # ---- Add role fields directly to the response ----
        data['is_staff'] = user.is_staff
        data['is_superuser'] = user.is_superuser

        return data

# ---------- Password Reset ----------
class CustomPasswordResetSerializer(PasswordResetSerializer):
    def save(self):
        request = self.context.get('request')
        email = self.validated_data['email']
        users = filter_users_by_email(email)
        frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
        current_site = get_current_site(request)

        for user in users:
            uid = user_pk_to_url_str(user)
            token = default_token_generator.make_token(user)
            reset_link = f"{frontend_url}auth/reset-password/{uid}/{token}/"

            context = {
                'user': user,
                'reset_link': reset_link,
                'uid': uid,
                'token': token,
                'site_name': current_site.name,
                'site_domain': current_site.domain,
                'protocol': 'https' if request.is_secure() else 'http',
            }
            subject = render_to_string('account/email/password_reset_key_subject.txt', context).strip()
            html_message = render_to_string('account/email/password_reset_key_message.html', context)
            plain_message = strip_tags(html_message)
            send_mail(
                subject,
                plain_message,
                settings.DEFAULT_FROM_EMAIL,
                [user_email(user)],
                html_message=html_message,
                fail_silently=False,
            )


# ---------- Wishlist ----------
class WishlistItemSerializer(serializers.ModelSerializer):
    product = serializers.PrimaryKeyRelatedField(read_only=True)
    class Meta:
        model = WishlistItem
        fields = ['id', 'product', 'added_at']


# ---------- Points ----------
class PointTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PointTransaction
        fields = ['id', 'points', 'type', 'description', 'created_at']


# ---------- Admin User Serializer (staff/superuser only) ----------
class AdminUserSerializer(serializers.ModelSerializer):
    profile = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'email', 'first_name', 'last_name',
            'is_staff', 'is_superuser', 'is_active',
            'is_banned', 'banned_until', 'login_disabled',
            'profile',
        ]
        read_only_fields = ['id', 'email', 'profile']

    def get_profile(self, obj):
        if hasattr(obj, 'profile'):
            return {
                'date_of_birth': obj.profile.date_of_birth,
                'phone': obj.profile.phone,
                'total_points': obj.profile.total_points,
            }
        return None
