from rest_framework import serializers
from .models import Article, ArticleCategory
from products.serializers import ProductListSerializer
from products.catalogue import visible_products
from .content import clean_article_html

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
    related_products = serializers.SerializerMethodField()
    body = serializers.SerializerMethodField()

    def get_body(self, obj):
        return clean_article_html(obj.body)

    def get_related_products(self, obj):
        products = visible_products().filter(blog_articles=obj).select_related('brand').prefetch_related('variants', 'images', 'offers')
        return ProductListSerializer(products, many=True, context=self.context).data

    class Meta:
        model = Article
        fields = [
            'id', 'title', 'slug', 'author', 'category',
            'body', 'image', 'published_at',
            'meta_title', 'meta_description',
            'related_products'
        ]
