from django.urls import path, include
from rest_framework.routers import DefaultRouter
from dj_rest_auth.registration.views import RegisterView, ConfirmEmailView
from dj_rest_auth.views import LoginView, PasswordResetView, PasswordResetConfirmView
from .views import UserViewSet, WishlistViewSet, PointsViewSet, AdminUserViewSet

router = DefaultRouter()
router.register(r'wishlist', WishlistViewSet, basename='wishlist')
router.register(r'points', PointsViewSet, basename='points')
router.register(r'admin/users', AdminUserViewSet, basename='admin-user')
# router.register(r'user', UserViewSet, basename='user')

urlpatterns = [
    # Registration
    path('register/', RegisterView.as_view(), name='rest_register'),
    path('verify-email/', ConfirmEmailView.as_view(), name='rest_verify_email'),

    # Login / Logout
    path('login/', LoginView.as_view(), name='rest_login'),
    path('logout/', include('dj_rest_auth.urls')),  # provides logout, user, password/change

    # Password reset (custom)
    path('password-reset/', PasswordResetView.as_view(), name='rest_password_reset'),
    path('password-reset-confirm/<uidb64>/<token>/', PasswordResetConfirmView.as_view(),

         name='rest_password_reset_confirm'),
    path('me/', UserViewSet.as_view({'get': 'me', 'patch': 'me'}), name='user-me'),

    # Wishlist, Points, Admin users
    path('', include(router.urls)),
]
