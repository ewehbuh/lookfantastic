"""Public product search backed by the catalogue; no external search service."""
from django.db.models import Q, Exists, OuterRef
from rest_framework.generics import GenericAPIView
from rest_framework.permissions import AllowAny
from rest_framework.exceptions import ValidationError
from products.catalogue import visible_products
from products.models import Variant
from products.views import product_list_response
from .serializers import SearchQuerySerializer


class ProductSearchView(GenericAPIView):
    permission_classes = [AllowAny]
    serializer_class = SearchQuerySerializer

    def get(self, request):
        for key in ('q', 'search'):
            if len(request.query_params.getlist(key)) > 1:
                raise ValidationError({key: 'Use one search query.'})
        serializer = self.get_serializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        query = serializer.validated_data['query']
        products = visible_products().select_related('brand', 'category').prefetch_related(
            'variants', 'images', 'offers').order_by('-created_at', '-pk')
        # Every term must match somewhere on a product; inactive SKUs never match.
        for term in query.split():
            matching_skus = Variant.objects.filter(product_id=OuterRef('pk'), is_active=True, sku__icontains=term)
            products = products.filter(
                Q(name__icontains=term) | Q(brand__name__icontains=term) |
                Q(description__icontains=term) |
                Q(Exists(matching_skus)))
        params = request.query_params.copy()
        # Already applied as tokenised search; do not apply the catalogue's phrase
        # search again when clients use the compatibility alias.
        params.pop('q', None)
        params.pop('search', None)
        response = product_list_response(self, request, products, filter_params=params)
        response.data['query'] = query
        return response
