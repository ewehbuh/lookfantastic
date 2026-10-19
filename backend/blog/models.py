from django.db import models
from django.conf import settings
from products.models import Product

class ArticleCategory(models.Model):
    """e.g. Skincare, Makeup, Hair, Trends, Advice"""
    name = models.CharField(max_length=100)
    slug = models.SlugField(unique=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name_plural = 'Article categories'
        ordering = ['name']

    def __str__(self):
        return self.name


class Article(models.Model):
    """A single editorial article."""
    title = models.CharField(max_length=255)
    slug = models.SlugField(unique=True)
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    category = models.ForeignKey(ArticleCategory, on_delete=models.SET_NULL, null=True, related_name='articles')
    excerpt = models.TextField(blank=True, help_text="Short summary for listing pages")
    body = models.TextField(help_text="Full article content (HTML or Markdown)")
    image = models.ImageField(upload_to='blog/', blank=True, null=True)
    is_published = models.BooleanField(default=False)
    published_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # SEO
    meta_title = models.CharField(max_length=255, blank=True)
    meta_description = models.TextField(blank=True)

    # Linked products (shop the story)
    related_products = models.ManyToManyField(Product, blank=True, related_name='blog_articles')

    class Meta:
        ordering = ['-published_at']

    def __str__(self):
        return self.title
