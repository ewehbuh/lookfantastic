"""Public product discovery using shared catalogue visibility and filters."""
from django.db.models import Q
from rest_framework import serializers
from rest_framework.generics import GenericAPIView
from rest_framework.permissions import AllowAny
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from products.catalogue import visible_products
from products.models import Brand
from products.filters import ProductFilter
from products.views import product_list_response
from .serializers import SearchQuerySerializer
from .engine import match, rank, corrected_query


def query_data(request):
    for key in ('q', 'search'):
        if len(request.query_params.getlist(key)) > 1:
            raise ValidationError({key: 'Use one search query.'})
    serializer = SearchQuerySerializer(data=request.query_params)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data


class ProductSearchView(GenericAPIView):
    permission_classes = [AllowAny]
    serializer_class = SearchQuerySerializer

    def get(self, request):
        data = query_data(request)
        query = data['query']
        params = request.query_params.copy()
        for key in ['q', 'search', 'typo_correction']:
            params.pop(key, None)
        if params.get('ordering') in ['relevance', '-relevance']:
            params.pop('ordering')
        base = visible_products().select_related('brand', 'category').prefetch_related('variants', 'images', 'offers')
        filters = ProductFilter(params, queryset=base, request=request)
        if not filters.is_valid():
            raise ValidationError(filters.errors)
        base = filters.qs
        products = match(base, query)
        correction = None
        if data['typo_correction'] and not products.exists():
            candidate = corrected_query(base, query)
            if candidate and match(base, candidate).exists():
                correction = candidate
                products = match(base, candidate)
        products = rank(products, correction or query)
        response = product_list_response(self, request, products, filter_params=params)
        response.data.update(query=query, corrected_query=correction, correction_applied=bool(correction))
        return response


class SuggestionsView(GenericAPIView):
    permission_classes = [AllowAny]
    serializer_class = SearchQuerySerializer

    def get(self, request):
        data = query_data(request)
        query = data['query']
        limit = serializers.IntegerField(min_value=1, max_value=10).run_validation(request.query_params.get('limit', 8))
        visible = visible_products()
        products = visible.filter(name__icontains=query).order_by('name', 'pk')[:limit]
        brands = Brand.objects.filter(products__in=visible, name__icontains=query).distinct().order_by('name')[:limit]
        choices = [{'type': 'product', 'label': p.name, 'slug': p.slug} for p in products]
        choices += [{'type': 'brand', 'label': b.name, 'slug': b.slug} for b in brands]
        choices.sort(key=lambda item: (not item['label'].casefold().startswith(query.casefold()), item['label'].casefold(), item['type']))
        return Response({'query': query, 'suggestions': choices[:limit]})
