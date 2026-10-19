from rest_framework import serializers
from .models import Article, ArticleCategory

class AdminArticleCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ArticleCategory
        fields = ['id', 'name', 'slug', 'is_active']

class AdminArticleSerializer(serializers.ModelSerializer):
    category = serializers.PrimaryKeyRelatedField(queryset=ArticleCategory.objects.all(), allow_null=True, required=False)
    related_products = serializers.PrimaryKeyRelatedField(many=True, queryset=ArticleCategory.objects.none())  # placeholder – adjust if needed

    class Meta:
        model = Article
        fields = [
            'id', 'title', 'slug', 'author', 'category',
            'excerpt', 'body', 'image', 'is_published', 'published_at',
            'meta_title', 'meta_description', 'related_products'
        ]
