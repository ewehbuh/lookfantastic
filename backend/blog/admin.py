from django.contrib import admin
from .models import Article, ArticleCategory

@admin.register(ArticleCategory)
class ArticleCategoryAdmin(admin.ModelAdmin):
    prepopulated_fields = {'slug': ('name',)}

@admin.register(Article)
class ArticleAdmin(admin.ModelAdmin):
    list_display = ['title', 'category', 'is_published', 'published_at']
    list_filter = ['is_published', 'category']
    prepopulated_fields = {'slug': ('title',)}
    filter_horizontal = ['related_products']
    fieldsets = (
        (None, {'fields': ('title', 'slug', 'author', 'category', 'excerpt', 'body', 'image')}),
        ('Publishing', {'fields': ('is_published', 'published_at')}),
        ('SEO', {'fields': ('meta_title', 'meta_description')}),
        ('Shop the Story', {'fields': ('related_products',)}),
    )
