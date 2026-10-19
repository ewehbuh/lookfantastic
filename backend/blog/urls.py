from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ArticleViewSet, ArticleCategoryViewSet   # public views
from .admin_views import AdminArticleViewSet, AdminArticleCategoryViewSet

router = DefaultRouter()
router.register(r'articles', ArticleViewSet, basename='article')
router.register(r'categories', ArticleCategoryViewSet, basename='article-category')
router.register(r'admin/articles', AdminArticleViewSet, basename='admin-article')
router.register(r'admin/categories', AdminArticleCategoryViewSet, basename='admin-article-category')

urlpatterns = [
    path('', include(router.urls)),
]
