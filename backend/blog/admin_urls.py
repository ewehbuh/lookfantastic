"""Compatibility routes used by the supplied frontend admin screens."""
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .admin_views import FrontendAdminArticleViewSet, AdminArticleCategoryViewSet

router = DefaultRouter()
router.register('admin/articles', FrontendAdminArticleViewSet, basename='frontend-admin-article')
router.register('admin/article-categories', AdminArticleCategoryViewSet, basename='frontend-admin-article-category')
urlpatterns = [path('', include(router.urls))]
