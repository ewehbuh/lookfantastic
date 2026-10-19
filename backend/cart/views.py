from decimal import Decimal

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.db import transaction
from django.utils import timezone
from .models import Cart, CartItem, Order, OrderItem
from .serializers import CartSerializer, CartItemSerializer, OrderSerializer, CheckoutSerializer
from products.models import Variant


def get_or_create_cart(request):
    """Retrieve the cart for the current user (or session)."""
    if request.user.is_authenticated:
        cart, _ = Cart.objects.get_or_create(user=request.user)
        # If there was a session cart, merge it
        session_key = request.session.session_key
        if session_key:
            guest_cart = Cart.objects.filter(session_key=session_key).first()
            if guest_cart and guest_cart != cart:
                _merge_carts(guest_cart, cart)
                guest_cart.delete()
    else:
        if not request.session.session_key:
            request.session.create()
        cart, _ = Cart.objects.get_or_create(session_key=request.session.session_key)
    return cart


def _merge_carts(source_cart, target_cart):
    """Move items from source into target, combining quantities."""
    for item in source_cart.items.all():
        existing = target_cart.items.filter(variant=item.variant).first()
        if existing:
            existing.quantity += item.quantity
            existing.save()
        else:
            item.cart = target_cart
            item.save()


class CartViewSet(viewsets.GenericViewSet):
    """
    Manage the shopping cart.
    Endpoints:
      - GET /api/cart/          → Retrieve current cart
      - POST /api/cart/add/     → Add item
      - PATCH /api/cart/update/ → Update quantity
      - DELETE /api/cart/remove/ → Remove item
      - POST /api/cart/checkout/ → Create order
    """
    serializer_class = CartSerializer
    queryset = Cart.objects.none()  # we handle the cart manually

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['cart'] = get_or_create_cart(self.request)
        return context

    def list(self, request):
        cart = get_or_create_cart(request)
        serializer = self.get_serializer(cart)
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    def add(self, request):
        cart = get_or_create_cart(request)
        variant_id = request.data.get('variant_id')
        quantity = int(request.data.get('quantity', 1))
        if quantity < 1:
            return Response({'error': 'Quantity must be at least 1.'}, status=status.HTTP_400_BAD_REQUEST)
        variant = get_object_or_404(Variant, pk=variant_id, is_active=True)
        if variant.stock < quantity:
            return Response({'error': 'Not enough stock.'}, status=status.HTTP_400_BAD_REQUEST)

        cart_item, created = CartItem.objects.get_or_create(cart=cart, variant=variant, defaults={'quantity': quantity})
        if not created:
            cart_item.quantity += quantity
            if cart_item.quantity > variant.stock:
                return Response({'error': 'Not enough stock for the requested quantity.'}, status=status.HTTP_400_BAD_REQUEST)
            cart_item.save()
        serializer = CartSerializer(cart, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['patch'], url_path='update-item')
    def update_item(self, request):
        cart = get_or_create_cart(request)
        item_id = request.data.get('item_id')
        quantity = int(request.data.get('quantity', 0))
        if quantity < 0:
            return Response({'error': 'Invalid quantity.'}, status=status.HTTP_400_BAD_REQUEST)
        cart_item = get_object_or_404(CartItem, pk=item_id, cart=cart)
        if quantity == 0:
            cart_item.delete()
        else:
            if quantity > cart_item.variant.stock:
                return Response({'error': 'Not enough stock.'}, status=status.HTTP_400_BAD_REQUEST)
            cart_item.quantity = quantity
            cart_item.save()
        serializer = CartSerializer(cart, context={'request': request})
        return Response(serializer.data)

    @action(detail=False, methods=['delete'])
    def remove(self, request):
        cart = get_or_create_cart(request)
        item_id = request.data.get('item_id')
        cart_item = get_object_or_404(CartItem, pk=item_id, cart=cart)
        cart_item.delete()
        serializer = CartSerializer(cart, context={'request': request})
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    def checkout(self, request):
        cart = get_or_create_cart(request)
        if not cart.items.exists():
            return Response({'error': 'Cart is empty.'}, status=status.HTTP_400_BAD_REQUEST)

        # Validate shipping details
        checkout_serializer = CheckoutSerializer(data=request.data)
        checkout_serializer.is_valid(raise_exception=True)
        data = checkout_serializer.validated_data

        from .payments import create_checkout
        return create_checkout(request, cart, data)

    @action(detail=False, methods=['get'])
    def orders(self, request):
        """Return the authenticated user's order history."""
        if not request.user.is_authenticated:
            return Response({'error': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)
        orders = Order.objects.filter(user=request.user).order_by('-created_at')
        serializer = OrderSerializer(orders, many=True, context={'request': request})
        return Response(serializer.data)
