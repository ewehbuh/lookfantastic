from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Min, Max, Count, Q, Sum
from .models import Brand
from .serializers import (
    ProductListSerializer, ProductDetailSerializer,
    CategorySerializer, BrandSerializer
)
from .filters import ProductFilter
from .catalogue import visible_categories, visible_products
from rest_framework.exceptions import ValidationError


class ProductViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Provides list (with faceted data) and detail views for products.
    """
    queryset = visible_products().select_related(
        'brand', 'category'
    ).prefetch_related('variants', 'images', 'offers')
    serializer_class = ProductListSerializer
    filterset_class = ProductFilter

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return ProductDetailSerializer
        return ProductListSerializer

    def list(self, request, *args, **kwargs):
        return product_list_response(self, request, self.get_queryset())

    def get_brand_facets(self, queryset):
        # Count products per brand within the current filtered set
        brand_counts = queryset.values('brand__name', 'brand__slug').annotate(
            count=Count('id', distinct=True)
        ).order_by('-count')[:20]
        return list(brand_counts)

    def get_category_facets(self, queryset):
        # Return immediate categories with counts (only those that appear)
        category_counts = queryset.values('category__name', 'category__slug').annotate(
            count=Count('id', distinct=True)
        ).order_by('-count')[:20]
        return list(category_counts)

    @action(detail=False, methods=['get'])
    def homepage(self, request):
        """Return new products, confirmed-sales bestsellers and featured brands."""
        new_products = self.get_queryset().order_by('-created_at', '-pk')[:8]
        bestsellers = self.get_queryset().annotate(sold_units=Sum(
            'variants__orderitem__quantity',
            filter=Q(variants__orderitem__order__status__in=['paid', 'processing', 'shipped'])
        )).filter(sold_units__gt=0).order_by('-sold_units', 'pk')[:8]
        brands = Brand.objects.filter(featured=True, is_active=True)[:6]
        categories = visible_categories().filter(depth=1)[:4]

        data = {
            'hero_categories': CategorySerializer(categories, many=True, context={'request': request}).data,
            'new_in': ProductListSerializer(new_products, many=True, context=self.get_serializer_context()).data,
            'bestsellers': ProductListSerializer(bestsellers, many=True, context=self.get_serializer_context()).data,
            'featured_brands': BrandSerializer(brands, many=True, context={'request': request}).data,
        }
        return Response(data)


class CategoryViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Returns the full category tree or a single category with its children.
    """
    queryset = visible_categories()
    serializer_class = CategorySerializer

    def list(self, request, *args, **kwargs):
        # Return only root nodes (full tree)
        roots = visible_categories().filter(depth=1)
        serializer = self.get_serializer(roots, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def products(self, request, pk=None):
        """List visible products in this category and its descendants."""
        category = self.get_object()
        queryset = visible_products().filter(category__in=category.get_descendants(include_self=True))
        return product_list_response(self, request, queryset)


class BrandViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Brand.objects.filter(is_active=True)
    serializer_class = BrandSerializer

    @action(detail=True, methods=['get'])
    def products(self, request, pk=None):
        brand = self.get_object()
        return product_list_response(self, request, visible_products().filter(brand=brand))


def product_list_response(view, request, queryset, filter_params=None):
    params = request.query_params if filter_params is None else filter_params
    filters = ProductFilter(params, queryset=queryset, request=request)
    if not filters.is_valid():
        raise ValidationError(filters.errors)
    queryset = filters.qs
    facets = {
        'total_count': queryset.count(),
        'price_range': queryset.aggregate(
            min_price=Min('variants__price', filter=Q(variants__is_active=True)),
            max_price=Max('variants__price', filter=Q(variants__is_active=True))),
        'brands': ProductViewSet.get_brand_facets(view, queryset),
        'categories': ProductViewSet.get_category_facets(view, queryset),
    }
    page = view.paginate_queryset(queryset)
    serializer = ProductListSerializer(page if page is not None else queryset, many=True,
                                      context={'request': request})
    data = {'results': serializer.data, 'facets': facets}
    if page is not None:
        data.update(count=view.paginator.page.paginator.count,
                    next=view.paginator.get_next_link(), previous=view.paginator.get_previous_link())
    return Response(data)
