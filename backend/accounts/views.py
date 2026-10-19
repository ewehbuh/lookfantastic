from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.contrib.auth import get_user_model
from products.models import Product
from .models import WishlistItem, PointTransaction
from .serializers import (
    WishlistItemSerializer,
    PointTransactionSerializer,
    AdminUserSerializer,
)

User = get_user_model()


class WishlistViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = WishlistItemSerializer

    def get_queryset(self):
        # Staff/superusers can see all wishlist items
        if self.request.user.is_staff:
            return WishlistItem.objects.select_related('product').all()
        return WishlistItem.objects.filter(user=self.request.user).select_related('product')

    def perform_create(self, serializer):
        product_id = self.request.data.get('product_id')
        product = get_object_or_404(Product, pk=product_id, is_active=True)
        if WishlistItem.objects.filter(user=self.request.user, product=product).exists():
            from rest_framework import serializers as drf_serializers
            raise drf_serializers.ValidationError("Already in wishlist.")
        serializer.save(user=self.request.user, product=product)


class PointsViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = PointTransactionSerializer

    def get_queryset(self):
        if self.request.user.is_staff:
            return PointTransaction.objects.all().order_by('-created_at')
        return PointTransaction.objects.filter(user=self.request.user).order_by('-created_at')

    @action(detail=False, methods=['get'])
    def balance(self, request):
        # Admin can check any user's balance via ?user_id=...
        user_id = request.query_params.get('user_id')
        if user_id and request.user.is_staff:
            target_user = get_object_or_404(User, pk=user_id)
            profile = target_user.profile
            return Response({
                'user': target_user.email,
                'total_points': profile.total_points,
            })
        profile = request.user.profile
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

    def get_serializer(self, *args, **kwargs):
        if self.action == 'partial_update':
            kwargs['partial'] = True
        return super().get_serializer(*args, **kwargs)


    from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .serializers import UserSerializer

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
