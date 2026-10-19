from rest_framework import serializers
from django.db import transaction
from .models import Product, Category, Brand, ProductImage, Variant, Offer

class AdminProductSerializer(serializers.ModelSerializer):
    brand = serializers.PrimaryKeyRelatedField(queryset=Brand.objects.all())
    category = serializers.PrimaryKeyRelatedField(queryset=Category.objects.all(), allow_null=True, required=False)

    class Meta:
        model = Product
        fields = [
            'id', 'name', 'slug', 'brand', 'category',
            'description', 'how_to_use', 'ingredients',
            'is_active', 'featured',
            'meta_title', 'meta_description'
        ]

class AdminVariantSerializer(serializers.ModelSerializer):
    # Explicitly declare the product field so it is always writable
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())

    class Meta:
        model = Variant
        fields = ['id', 'product', 'sku', 'size', 'shade', 'price', 'compare_at_price', 'stock', 'is_active']

    def validate(self, attrs):
        price = attrs.get('price', getattr(self.instance, 'price', None))
        compare = attrs.get('compare_at_price', getattr(self.instance, 'compare_at_price', None))
        if price is not None and price < 0:
            raise serializers.ValidationError({'price': 'Price cannot be negative.'})
        if compare is not None and (compare < 0 or price is not None and compare < price):
            raise serializers.ValidationError({'compare_at_price': 'Reference price cannot be below the selling price.'})
        return attrs

    def create(self, validated_data):
        # validated_data already contains 'product' as an instance, thanks to PrimaryKeyRelatedField
        return super().create(validated_data)


class AdminCategorySerializer(serializers.ModelSerializer):
    parent_id = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(),
        allow_null=True,
        required=False,
        write_only=True,
        source='parent'   # map to the treebeard parent attribute
    )

    class Meta:
        model = Category
        fields = ['id', 'name', 'slug', 'description', 'parent_id', 'is_active']

    def create(self, validated_data):
        parent = validated_data.pop('parent', None)   # now 'parent' because of source='parent'
        if parent:
            instance = parent.add_child(**validated_data)
        else:
            instance = Category.add_root(**validated_data)
        return instance

    def validate(self, attrs):
        parent = attrs.get('parent')
        if self.instance and parent and (parent.pk == self.instance.pk or parent.is_descendant_of(self.instance)):
            raise serializers.ValidationError({'parent_id': 'A category cannot be its own ancestor.'})
        return attrs

    @transaction.atomic
    def update(self, instance, validated_data):
        supplied = 'parent' in validated_data
        parent = validated_data.pop('parent', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if supplied:
            if parent and (instance.is_root() or instance.get_parent().pk != parent.pk):
                instance.move(parent, pos='sorted-child')
            elif parent is None and not instance.is_root():
                instance.move(Category.get_first_root_node(), pos='sorted-sibling')
        instance.refresh_from_db()
        return instance


class AdminBrandSerializer(serializers.ModelSerializer):
    class Meta:
        model = Brand
        fields = ['id', 'name', 'slug', 'description', 'website', 'is_active', 'featured']


class AdminOfferSerializer(serializers.ModelSerializer):
    # Accept list of product IDs, category IDs, brand IDs
    products = serializers.PrimaryKeyRelatedField(
        many=True, queryset=Product.objects.all(), required=False
    )
    categories = serializers.PrimaryKeyRelatedField(
        many=True, queryset=Category.objects.all(), required=False
    )
    brands = serializers.PrimaryKeyRelatedField(
        many=True, queryset=Brand.objects.all(), required=False
    )

    class Meta:
        model = Offer
        fields = [
            'id', 'name', 'slug', 'offer_type', 'value',
            'valid_from', 'valid_to', 'is_active',
            'products', 'categories', 'brands'
        ]

    def validate(self, attrs):
        start = attrs.get('valid_from', getattr(self.instance, 'valid_from', None))
        end = attrs.get('valid_to', getattr(self.instance, 'valid_to', None))
        kind = attrs.get('offer_type', getattr(self.instance, 'offer_type', None))
        value = attrs.get('value', getattr(self.instance, 'value', None))
        if start and end and end <= start:
            raise serializers.ValidationError({'valid_to': 'Offer must end after it starts.'})
        if value is not None and (value < 0 or kind == 'percentage' and value > 100):
            raise serializers.ValidationError({'value': 'Use a nonnegative amount or a percentage from 0 to 100.'})
        if kind == 'buy_x_get_y':
            raise serializers.ValidationError({'offer_type': 'Buy-X-get-Y pricing is not implemented.'})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        products = validated_data.pop('products', [])
        categories = validated_data.pop('categories', [])
        brands = validated_data.pop('brands', [])
        offer = Offer.objects.create(**validated_data)
        if products:
            # Use the through model directly, or set the M2M (offer.products.set)
            offer.products.set(products)
        if categories:
            offer.categories.set(categories)
        if brands:
            offer.brands.set(brands)
        return offer

    @transaction.atomic
    def update(self, instance, validated_data):
        products = validated_data.pop('products', None)
        categories = validated_data.pop('categories', None)
        brands = validated_data.pop('brands', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if products is not None:
            instance.products.set(products)
        if categories is not None:
            instance.categories.set(categories)
        if brands is not None:
            instance.brands.set(brands)
        return instance




class AdminProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ['id', 'product', 'image', 'alt_text', 'order']
