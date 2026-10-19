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
    promotion_discount = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    line_total = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = CartItem
        fields = ['id', 'variant', 'variant_id', 'quantity', 'unit_price', 'line_total', 'promotion_discount']

    def validate_variant_id(self, value):
        from products.models import Variant
        try:
            variant = Variant.objects.get(pk=value, is_active=True)
        except Variant.DoesNotExist:
            raise serializers.ValidationError("Variant not available.")
        return variant


class CartSerializer(serializers.ModelSerializer):
    warnings = serializers.SerializerMethodField()
    voucher = serializers.SerializerMethodField()

    def get_voucher(self, obj):
        if not obj.voucher_id:
            return None
        from .vouchers import discount_for
        try:
            return {"code": obj.voucher.code, "valid": True, "discount_amount": str(discount_for(obj.voucher, obj.total_price))}
        except serializers.ValidationError as exc:
            return {"code": obj.voucher.code, "valid": False, "discount_amount": "0.00", "error": str(exc.detail)}

    def get_warnings(self, obj):
        return getattr(self.context.get('request'), '_cart_warnings', [])

    items = CartItemSerializer(many=True, read_only=True)
    total_price = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    total_items = serializers.IntegerField(read_only=True)

    class Meta:
        model = Cart
        fields = ['id', 'items', 'total_price', 'total_items', 'warnings', 'voucher']


class OrderItemSerializer(serializers.ModelSerializer):
    promotion_discount = serializers.SerializerMethodField()

    def get_promotion_discount(self, obj):
        return str(max(obj.unit_price * obj.quantity - obj.line_total, 0))

    class Meta:
        model = OrderItem
        fields = ['id', 'sku', 'product_name', 'size', 'shade', 'quantity', 'unit_price', 'line_total', 'promotion_discount']


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    shipments = serializers.SerializerMethodField()
    returns = serializers.SerializerMethodField()
    refunds = serializers.SerializerMethodField()

    def get_shipments(self, obj):
        from fulfillment.serializers import ShipmentSerializer
        return ShipmentSerializer(obj.shipments.prefetch_related('events'), many=True).data

    def get_returns(self, obj):
        from fulfillment.serializers import ReturnSerializer
        return ReturnSerializer(obj.returns.all(), many=True).data

    def get_refunds(self, obj):
        from fulfillment.serializers import RefundSerializer
        return RefundSerializer(obj.refunds.all(), many=True).data


    class Meta:
        model = Order
        fields = [
            'id', 'order_number', 'status', 'shipping_name', 'shipping_address',
            'shipping_city', 'shipping_postcode', 'shipping_country',
            'subtotal', 'discount_amount', 'refunded_amount', 'shipping_cost', 'total', 'items', 'shipments', 'returns', 'refunds', 'created_at', 'payment_method', 'currency'
        ]


class CheckoutSerializer(serializers.Serializer):
    """Data required to finalise the order."""
    address_id = serializers.IntegerField(min_value=1, required=False, write_only=True)
    email = serializers.EmailField()
    shipping_name = serializers.CharField(max_length=100, required=False)
    shipping_address = serializers.CharField(max_length=255, required=False)
    shipping_city = serializers.CharField(max_length=100, required=False)
    shipping_postcode = serializers.CharField(max_length=20, required=False)
    shipping_country = serializers.CharField(max_length=100, required=False)
    payment_method = serializers.ChoiceField(choices=['stripe', 'bank', 'crypto'], default='stripe')

    def validate(self, attrs):
        address_id = attrs.pop('address_id', None)
        if address_id is not None:
            from accounts.models import Address
            request = self.context.get('request')
            if not request or not request.user.is_authenticated:
                raise serializers.ValidationError({'address_id': 'Sign in to use saved addresses.'})
            address = Address.objects.filter(pk=address_id, user=request.user).first()
            if not address:
                raise serializers.ValidationError({'address_id': 'Address is unavailable.'})
            if any(key.startswith('shipping_') for key in attrs):
                raise serializers.ValidationError({'address_id': 'Choose a saved address or supply shipping fields.'})
            attrs.update(shipping_name=address.full_name, shipping_address='\n'.join(filter(None, [address.line1, address.line2])),
                         shipping_city=address.city, shipping_postcode=address.postcode, shipping_country=address.country)
        missing = [key for key in ['shipping_name', 'shipping_address', 'shipping_city', 'shipping_postcode', 'shipping_country'] if not attrs.get(key)]
        if missing:
            raise serializers.ValidationError({key: 'This field is required.' for key in missing})
        return attrs


class AddItemSerializer(serializers.Serializer):
    variant_id = serializers.IntegerField(min_value=1)
    quantity = serializers.IntegerField(min_value=1, max_value=10000, default=1)


class UpdateItemSerializer(serializers.Serializer):
    item_id = serializers.IntegerField(min_value=1)
    quantity = serializers.IntegerField(min_value=0, max_value=10000)


class RemoveItemSerializer(serializers.Serializer):
    item_id = serializers.IntegerField(min_value=1)
