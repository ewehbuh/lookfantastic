from rest_framework import viewsets, permissions, filters
from django_filters.rest_framework import DjangoFilterBackend
from django.utils.timezone import now
from django.db.models import Q
from .models import Article, ArticleCategory
from .serializers import (
    ArticleListSerializer,
    ArticleDetailSerializer,
    ArticleCategorySerializer,
)


class ArticleCategoryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ArticleCategory.objects.filter(is_active=True)
    serializer_class = ArticleCategorySerializer
    permission_classes = [permissions.AllowAny]


class ArticleViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Public articles with optional category filter and search.
    """
    queryset = Article.objects.none()
    permission_classes = [permissions.AllowAny]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['category__slug', 'slug']
    search_fields = ['title', 'excerpt', 'body']
    ordering_fields = ['published_at', 'title']
    ordering = ['-published_at', '-pk']

    def get_queryset(self):
        # Compute the clock boundary for each request, not when this module loads.
        return Article.objects.filter(is_published=True, published_at__lte=now()).filter(
            Q(category__isnull=True) | Q(category__is_active=True)
        ).select_related('category')

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return ArticleDetailSerializer
        return ArticleListSerializer
