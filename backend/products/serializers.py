from django.utils import timezone

from rest_framework import serializers
from .models import Category, Brand, Product, Variant, Offer, ProductImage


class CategorySerializer(serializers.ModelSerializer):
    children = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ['id', 'name', 'slug', 'description', 'image', 'children']

    def get_children(self, obj):
        # Return immediate children (active only)
        children = obj.get_children().filter(is_active=True)
        return CategorySerializer(children, many=True, context=self.context).data


class CategoryFlatSerializer(serializers.ModelSerializer):
    """Simple category representation without nesting."""
    class Meta:
        model = Category
        fields = ['id', 'name', 'slug']


class BrandSerializer(serializers.ModelSerializer):
    class Meta:
        model = Brand
        fields = ['id', 'name', 'slug', 'logo', 'description']


class VariantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Variant
        fields = ['id', 'sku', 'size', 'shade', 'price', 'compare_at_price', 'stock', 'image']


class ProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ['id', 'image', 'alt_text', 'order']


class ProductListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for listing pages (PLP)."""
    price = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    compare_at_price = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True, allow_null=True)
    default_variant = VariantSerializer(read_only=True)
    brand = BrandSerializer(read_only=True)
    image = serializers.SerializerMethodField()
    on_offer = serializers.BooleanField(read_only=True)
    rating_average = serializers.FloatField(read_only=True, allow_null=True)
    review_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Product
        fields = [
            'id', 'name', 'slug', 'brand', 'price', 'compare_at_price',
            'default_variant', 'image', 'on_offer', 'rating_average', 'review_count', 'featured'   # ← added
        ]

    def get_image(self, obj):
        first_image = obj.images.first()
        if first_image:
            return self.context['request'].build_absolute_uri(first_image.image.url)
        return None


class ProductDetailSerializer(serializers.ModelSerializer):
    brand = BrandSerializer(read_only=True)
    category = CategoryFlatSerializer(read_only=True)
    variants = serializers.SerializerMethodField()
    images = ProductImageSerializer(many=True, read_only=True)
    offers = serializers.SerializerMethodField()
    default_variant = serializers.SerializerMethodField()
    rating_average = serializers.FloatField(read_only=True, allow_null=True)
    review_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Product
        fields = [
            'id', 'name', 'slug', 'brand', 'category', 'description',
            'how_to_use', 'ingredients', 'variants', 'images', 'offers',
            'default_variant', 'rating_average', 'review_count', 'featured',   # ← added
            'meta_title', 'meta_description'
        ]

    def get_variants(self, obj):
        return VariantSerializer(obj.variants.filter(is_active=True), many=True, context=self.context).data

    def get_offers(self, obj):
        from .promotions import applicable_offers
        active_offers = applicable_offers(obj)
        return OfferSerializer(active_offers, many=True).data

    def get_default_variant(self, obj):
        variant = obj.default_variant   # model property
        if variant:
            return VariantSerializer(variant, context=self.context).data
        return None


class OfferSerializer(serializers.ModelSerializer):
    class Meta:
        model = Offer
        fields = ['id', 'name', 'slug', 'offer_type', 'value', 'valid_from', 'valid_to', 'buy_quantity', 'free_quantity']
