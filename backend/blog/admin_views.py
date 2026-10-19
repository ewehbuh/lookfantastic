from rest_framework import viewsets, permissions
from .models import Article, ArticleCategory
from .admin_serializers import AdminArticleSerializer, AdminArticleCategorySerializer

class AdminArticleViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAdminUser]
    queryset = Article.objects.all()
    serializer_class = AdminArticleSerializer

class AdminArticleCategoryViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAdminUser]
    queryset = ArticleCategory.objects.all()
    serializer_class = AdminArticleCategorySerializer
