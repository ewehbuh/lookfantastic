from allauth.account.views import ConfirmEmailView
from django.conf import settings
from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.contrib.auth import get_user_model
from .models import WishlistItem, PointTransaction, UserProfile
from rest_framework.exceptions import PermissionDenied, ValidationError
from django.db import IntegrityError, transaction
from .serializers import (
    WishlistItemSerializer,
    PointTransactionSerializer,
    AdminUserSerializer,
    UserSerializer,
)

User = get_user_model()


class WishlistViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = WishlistItemSerializer
    http_method_names = ["get", "post", "delete", "head", "options"]

    def get_queryset(self):
        return WishlistItem.objects.filter(user=self.request.user).select_related('product__brand').prefetch_related('product__images')

    def perform_create(self, serializer):
        try:
            with transaction.atomic():
                serializer.save(user=self.request.user)
        except IntegrityError:
            raise ValidationError({'product_id': 'Already in wishlist.'})


class PointsViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = PointTransactionSerializer

    def get_queryset(self):
        return PointTransaction.objects.filter(user=self.request.user).order_by('-created_at')

    @action(detail=False, methods=['get'])
    def balance(self, request):
        # Admin can check any user's balance via ?user_id=...
        user_id = request.query_params.get('user_id')
        if user_id and request.user.is_staff:
            try:
                user_id = int(user_id)
            except (ValueError, TypeError):
                raise ValidationError({'user_id': 'A valid user ID is required.'})
            target_user = get_object_or_404(User, pk=user_id)
            profile, _ = UserProfile.objects.get_or_create(user=target_user)
            return Response({
                'user': target_user.email,
                'total_points': profile.total_points,
            })
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        return Response({'total_points': profile.total_points})


class AdminUserViewSet(viewsets.ModelViewSet):
    """
    Admin‑only user management.
    Lists all users, allows updating admin fields.
    """
    permission_classes = [permissions.IsAdminUser]
    serializer_class = AdminUserSerializer
    queryset = User.objects.select_related('profile').all()
    http_method_names = ['get', 'patch', 'head', 'options']  # no PUT, no POST

    def perform_update(self, serializer):
        actor = self.request.user
        target = serializer.instance
        if not actor.is_superuser:
            if target.is_staff or target.is_superuser:
                raise PermissionDenied('Only superusers can modify staff accounts.')
            if {'is_staff', 'is_superuser'} & serializer.validated_data.keys():
                raise PermissionDenied('Only superusers can change user roles.')
        serializer.save()

    def get_serializer(self, *args, **kwargs):
        if self.action == 'partial_update':
            kwargs['partial'] = True
        return super().get_serializer(*args, **kwargs)



class UserViewSet(viewsets.GenericViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = UserSerializer

    @action(detail=False, methods=['get', 'patch'])
    def me(self, request):
        """
        GET  /api/accounts/me/  → return current user
        PATCH /api/accounts/me/ → update own details
        """
        if request.method == 'GET':
            serializer = self.get_serializer(request.user)
            return Response(serializer.data)

        if request.method == 'PATCH':
            serializer = self.get_serializer(request.user, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data)


# The API project does not mount allauth's HTML login/signup routes, so use a
# self-contained confirmation page rather than its entrance-page templates.
class EmailConfirmationPage(ConfirmEmailView):
    template_name = 'accounts/email_confirm.html'

    def get_context_data(self, **kwargs):
        return {'confirmation': self.object}

    def get_redirect_url(self):
        return settings.FRONTEND_URL.rstrip('/') + '/login'
