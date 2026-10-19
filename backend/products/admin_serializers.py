from rest_framework import serializers
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

    def update(self, instance, validated_data):
        parent = validated_data.pop('parent', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if parent and instance.get_parent() != parent:
            instance.move(parent, pos='last-child')
        elif parent is None and not instance.is_root():
            instance.move(Category.get_first_root_node(), pos='left')
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
