from rest_framework import serializers
from .models import Article, ArticleCategory
from products.models import Product
from django.utils import timezone
from .content import clean_article_html
from .serializers import ArticleCategorySerializer

class AdminArticleCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ArticleCategory
        fields = ['id', 'name', 'slug', 'is_active']

class AdminArticleSerializer(serializers.ModelSerializer):
    category = serializers.PrimaryKeyRelatedField(queryset=ArticleCategory.objects.all(), allow_null=True, required=False)
    related_products = serializers.PrimaryKeyRelatedField(many=True, queryset=Product.objects.all(), required=False)
    category_id = serializers.PrimaryKeyRelatedField(source="category", queryset=ArticleCategory.objects.all(),
                                                     allow_null=True, required=False, write_only=True)

    def to_internal_value(self, data):
        if 'category' in data and 'category_id' in data and str(data['category']) != str(data['category_id']):
            raise serializers.ValidationError({'category_id': 'Conflicting category fields.'})
        return super().to_internal_value(data)

    def validate_body(self, value):
        return clean_article_html(value)

    def validate(self, attrs):
        published = attrs.get('is_published', getattr(self.instance, 'is_published', False))
        date = attrs.get('published_at', getattr(self.instance, 'published_at', None))
        if published and date is None:
            attrs['published_at'] = timezone.now()
        return attrs

    class Meta:
        model = Article
        fields = [
            'id', 'title', 'slug', 'author', 'category', 'category_id',
            'excerpt', 'body', 'image', 'is_published', 'published_at',
            'meta_title', 'meta_description', 'related_products'
        ]


class FrontendAdminArticleSerializer(AdminArticleSerializer):
    # The supplied editor reads category.id; keep the canonical API's numeric
    # category representation unchanged for existing clients.
    category = ArticleCategorySerializer(read_only=True)
