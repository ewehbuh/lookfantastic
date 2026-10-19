from rest_framework import viewsets, permissions

from products.serializers import ProductImageSerializer
from .models import Product, Category, Brand, ProductImage, Variant, Offer
from .admin_serializers import (
    AdminProductImageSerializer, AdminProductSerializer, AdminCategorySerializer,
    AdminBrandSerializer, AdminVariantSerializer, AdminOfferSerializer
)

class AdminProductViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAdminUser]
    queryset = Product.objects.all()
    serializer_class = AdminProductSerializer

class AdminCategoryViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAdminUser]
    queryset = Category.objects.all()
    serializer_class = AdminCategorySerializer

class AdminBrandViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAdminUser]
    queryset = Brand.objects.all()
    serializer_class = AdminBrandSerializer

class AdminVariantViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAdminUser]
    queryset = Variant.objects.all()
    serializer_class = AdminVariantSerializer

class AdminOfferViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAdminUser]
    queryset = Offer.objects.all()
    serializer_class = AdminOfferSerializer


# class AdminProductImageViewSet(viewsets.ModelViewSet):
#     permission_classes = [permissions.IsAdminUser]
#     queryset = ProductImage.objects.all()
#     serializer_class = ProductImageSerializer




class AdminProductImageViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAdminUser]
    queryset = ProductImage.objects.all()
    serializer_class = AdminProductImageSerializer
    http_method_names = ['get', 'post', 'delete', 'head', 'options']   # no PUT/PATCH


from .models import ProductOffer
from .admin_serializers import AdminProductOfferSerializer


class AdminProductOfferViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAdminUser]
    queryset = ProductOffer.objects.all().order_by('pk')
    serializer_class = AdminProductOfferSerializer
