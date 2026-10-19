from django.urls import path, include
from rest_framework.routers import DefaultRouter
from dj_rest_auth.registration.views import RegisterView, VerifyEmailView
from dj_rest_auth.views import LoginView, LogoutView, PasswordChangeView, PasswordResetView, PasswordResetConfirmView
from dj_rest_auth.jwt_auth import get_refresh_view
from .views import UserViewSet, WishlistViewSet, PointsViewSet, AdminUserViewSet, EmailConfirmationPage

router = DefaultRouter()
router.register(r'wishlist', WishlistViewSet, basename='wishlist')
router.register(r'points', PointsViewSet, basename='points')
router.register(r'admin/users', AdminUserViewSet, basename='admin-user')
# router.register(r'user', UserViewSet, basename='user')

urlpatterns = [
    # Registration
    path('register/', RegisterView.as_view(), name='rest_register'),
    path('verify-email/', VerifyEmailView.as_view(), name='rest_verify_email'),
    path('confirm-email/<str:key>/', EmailConfirmationPage.as_view(), name='account_confirm_email'),

    # Login / Logout
    path('login/', LoginView.as_view(), name='rest_login'),
    path('logout/', LogoutView.as_view(), name='rest_logout'),
    path('token/refresh/', get_refresh_view().as_view(), name='token_refresh'),
    path('password/change/', PasswordChangeView.as_view(), name='rest_password_change'),

    # Password reset (custom)
    path('password-reset/', PasswordResetView.as_view(), name='rest_password_reset'),
    path('password-reset/confirm/', PasswordResetConfirmView.as_view(), name='password_reset_confirm'),
    path('password-reset-confirm/<uidb64>/<token>/', PasswordResetConfirmView.as_view(),

         name='rest_password_reset_confirm'),
    path('me/', UserViewSet.as_view({'get': 'me', 'patch': 'me'}), name='user-me'),

    # Wishlist, Points, Admin users
    path('', include(router.urls)),
]
