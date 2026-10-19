"""Plan management alias used by the supplied frontend."""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .admin_views import AdminSubscriptionPlanViewSet

router = DefaultRouter()
router.register('admin/plans', AdminSubscriptionPlanViewSet, basename='frontend-admin-plan')
urlpatterns = [path('', include(router.urls))]
