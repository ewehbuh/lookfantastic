from rest_framework import serializers
from .models import Cart, CartItem, Order, OrderItem
from products.serializers import VariantSerializer


class BasketVariantSerializer(VariantSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)

    class Meta(VariantSerializer.Meta):
        fields = [*VariantSerializer.Meta.fields, 'product_name']


class CartItemSerializer(serializers.ModelSerializer):
    variant = BasketVariantSerializer(read_only=True)
    variant_id = serializers.IntegerField(write_only=True)
    unit_price = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    line_total = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = CartItem
        fields = ['id', 'variant', 'variant_id', 'quantity', 'unit_price', 'line_total']

    def validate_variant_id(self, value):
        from products.models import Variant
        try:
            variant = Variant.objects.get(pk=value, is_active=True)
        except Variant.DoesNotExist:
            raise serializers.ValidationError("Variant not available.")
        return variant


class CartSerializer(serializers.ModelSerializer):
    warnings = serializers.SerializerMethodField()

    def get_warnings(self, obj):
        return getattr(self.context.get('request'), '_cart_warnings', [])

    items = CartItemSerializer(many=True, read_only=True)
    total_price = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    total_items = serializers.IntegerField(read_only=True)

    class Meta:
        model = Cart
        fields = ['id', 'items', 'total_price', 'total_items', 'warnings']


class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = ['sku', 'product_name', 'size', 'shade', 'quantity', 'unit_price', 'line_total']


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = [
            'id', 'order_number', 'status', 'shipping_name', 'shipping_address',
            'shipping_city', 'shipping_postcode', 'shipping_country',
            'subtotal', 'shipping_cost', 'total', 'items', 'created_at', 'payment_method', 'currency'
        ]


class CheckoutSerializer(serializers.Serializer):
    """Data required to finalise the order."""
    email = serializers.EmailField()
    shipping_name = serializers.CharField(max_length=100)
    shipping_address = serializers.CharField(max_length=255)
    shipping_city = serializers.CharField(max_length=100)
    shipping_postcode = serializers.CharField(max_length=20)
    shipping_country = serializers.CharField(max_length=100)
    payment_method = serializers.ChoiceField(choices=['stripe', 'bank', 'crypto'], default='stripe')


class AddItemSerializer(serializers.Serializer):
    variant_id = serializers.IntegerField(min_value=1)
    quantity = serializers.IntegerField(min_value=1, max_value=10000, default=1)


class UpdateItemSerializer(serializers.Serializer):
    item_id = serializers.IntegerField(min_value=1)
    quantity = serializers.IntegerField(min_value=0, max_value=10000)


class RemoveItemSerializer(serializers.Serializer):
    item_id = serializers.IntegerField(min_value=1)
