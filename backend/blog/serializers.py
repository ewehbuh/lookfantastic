from rest_framework import serializers
from .models import Article, ArticleCategory
from products.serializers import ProductListSerializer

class ArticleCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ArticleCategory
        fields = ['id', 'name', 'slug']


class ArticleListSerializer(serializers.ModelSerializer):
    category = ArticleCategorySerializer(read_only=True)

    class Meta:
        model = Article
        fields = [
            'id', 'title', 'slug', 'category', 'excerpt',
            'image', 'published_at'
        ]


class ArticleDetailSerializer(serializers.ModelSerializer):
    category = ArticleCategorySerializer(read_only=True)
    related_products = ProductListSerializer(many=True, read_only=True)

    class Meta:
        model = Article
        fields = [
            'id', 'title', 'slug', 'author', 'category',
            'body', 'image', 'published_at',
            'meta_title', 'meta_description',
            'related_products'
        ]
