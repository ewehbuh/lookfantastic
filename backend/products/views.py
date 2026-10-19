from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from django.db.models import Min, Max, Count, Q
from .models import Product, Category, Brand, Offer, ProductOffer
from .serializers import (
    ProductListSerializer, ProductDetailSerializer,
    CategorySerializer, BrandSerializer
)
from .filters import ProductFilter


class ProductViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Provides list (with faceted data) and detail views for products.
    """
    queryset = Product.objects.filter(is_active=True).select_related(
        'brand', 'category'
    ).prefetch_related('variants', 'images', 'offers')
    serializer_class = ProductListSerializer
    filterset_class = ProductFilter

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return ProductDetailSerializer
        return ProductListSerializer

    def get_serializer_context(self):
        context = super().get_serializer_context()
        # Add current active offers to context so we can flag on_offer
        now = timezone.now()
        active_offers = Offer.objects.filter(
            is_active=True,
            valid_from__lte=now,
            valid_to__gte=now
        )
        # Build a set of product IDs that are currently on offer
        offer_product_ids = set(
            ProductOffer.objects.filter(offer__in=active_offers)
            .values_list('product_id', flat=True)
        )
        context['offer_product_ids'] = offer_product_ids
        return context

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        # Compute faceted metadata on the filtered queryset
        facets = {
            'total_count': queryset.count(),
            'price_range': queryset.aggregate(
                min_price=Min('variants__price', filter=Q(variants__is_active=True)),
                max_price=Max('variants__price', filter=Q(variants__is_active=True))
            ),
            'brands': self.get_brand_facets(queryset),
            'categories': self.get_category_facets(queryset),
        }

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            data = {
                'facets': facets,
                'results': serializer.data,
                'count': self.paginator.page.paginator.count,
                'next': self.paginator.get_next_link(),
                'previous': self.paginator.get_previous_link(),
            }
            return Response(data)

        serializer = self.get_serializer(queryset, many=True)
        return Response({
            'facets': facets,
            'results': serializer.data,
        })

    def get_brand_facets(self, queryset):
        # Count products per brand within the current filtered set
        brand_counts = queryset.values('brand__name', 'brand__slug').annotate(
            count=Count('id')
        ).order_by('-count')[:20]
        return list(brand_counts)

    def get_category_facets(self, queryset):
        # Return immediate categories with counts (only those that appear)
        category_counts = queryset.values('category__name', 'category__slug').annotate(
            count=Count('id')
        ).order_by('-count')[:20]
        return list(category_counts)

    @action(detail=False, methods=['get'])
    def homepage(self, request):
        """Return curated data for the homepage: banners, new in, bestsellers, etc."""
        # Example: 4 hero categories, 8 new products, 8 bestsellers, featured brands
        new_products = self.queryset.order_by('-created_at')[:8]
        bestsellers = self.queryset.order_by('?')[:8]   # replace with actual sales logic
        brands = Brand.objects.filter(featured=True)[:6]
        categories = Category.get_root_nodes().filter(is_active=True)[:4]

        data = {
            'hero_categories': CategorySerializer(categories, many=True, context={'request': request}).data,
            'new_in': ProductListSerializer(new_products, many=True, context=self.get_serializer_context()).data,
            'bestsellers': ProductListSerializer(bestsellers, many=True, context=self.get_serializer_context()).data,
            'featured_brands': BrandSerializer(brands, many=True).data,
        }
        return Response(data)


class CategoryViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Returns the full category tree or a single category with its children.
    """
    queryset = Category.objects.filter(is_active=True)
    serializer_class = CategorySerializer

    def list(self, request, *args, **kwargs):
        # Return only root nodes (full tree)
        roots = Category.get_root_nodes().filter(is_active=True)
        serializer = self.get_serializer(roots, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def products(self, request, pk=None):
        """Redirect to product list filtered by this category."""
        category = self.get_object()
        # You could just return a link, or query products directly
        from django.http import QueryDict
        params = QueryDict('category=' + category.slug, mutable=True)
        # Append any additional request params (like page)
        for key, value in request.query_params.items():
            if key != 'category':
                params[key] = value
        # Return redirect to product list with filter
        # But simpler: return the product list here.
        products = Product.objects.filter(category__in=category.get_descendants(include_self=True), is_active=True)
        page = self.paginate_queryset(products)
        if page is not None:
            serializer = ProductListSerializer(page, many=True, context={'request': request})
            return self.get_paginated_response(serializer.data)
        serializer = ProductListSerializer(products, many=True, context={'request': request})
        return Response(serializer.data)


class BrandViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Brand.objects.filter(is_active=True)
    serializer_class = BrandSerializer

    @action(detail=True, methods=['get'])
    def products(self, request, pk=None):
        brand = self.get_object()
        products = Product.objects.filter(brand=brand, is_active=True)
        # apply any extra filters from request (like ordering)
        filterset = ProductFilter(request.GET, queryset=products)
        queryset = filterset.qs
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = ProductListSerializer(page, many=True, context={'request': request})
            return self.get_paginated_response(serializer.data)
        serializer = ProductListSerializer(queryset, many=True, context={'request': request})
        return Response(serializer.data)
