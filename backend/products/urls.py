from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ProductViewSet, CategoryViewSet, BrandViewSet   # public viewsets
from .admin_views import (
    AdminProductImageViewSet, AdminProductViewSet, AdminCategoryViewSet, AdminBrandViewSet,
    AdminVariantViewSet, AdminOfferViewSet
)

router = DefaultRouter()
# Public (read-only)
router.register(r'products', ProductViewSet, basename='product')
router.register(r'categories', CategoryViewSet, basename='category')
router.register(r'brands', BrandViewSet, basename='brand')

# Admin CRUD
router.register(r'admin/products', AdminProductViewSet, basename='admin-product')
router.register(r'admin/categories', AdminCategoryViewSet, basename='admin-category')
router.register(r'admin/brands', AdminBrandViewSet, basename='admin-brand')
router.register(r'admin/variants', AdminVariantViewSet, basename='admin-variant')
router.register(r'admin/offers', AdminOfferViewSet, basename='admin-offer')
router.register(r'admin/images', AdminProductImageViewSet, basename='admin-image')

urlpatterns = [
    path('', include(router.urls)),
]
