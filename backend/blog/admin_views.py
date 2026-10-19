from rest_framework import viewsets, permissions
from .models import Article, ArticleCategory
from .admin_serializers import AdminArticleSerializer, AdminArticleCategorySerializer, FrontendAdminArticleSerializer

class AdminArticleViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAdminUser]
    queryset = Article.objects.all()
    serializer_class = AdminArticleSerializer

    def perform_create(self, serializer):
        serializer.save(author=serializer.validated_data.get('author') or self.request.user)

class AdminArticleCategoryViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAdminUser]
    queryset = ArticleCategory.objects.all()
    serializer_class = AdminArticleCategorySerializer


class FrontendAdminArticleViewSet(AdminArticleViewSet):
    serializer_class = FrontendAdminArticleSerializer
