import django_filters
from django.db.models import Q, Exists, OuterRef, Subquery
from django import forms
from django.core.exceptions import ValidationError
from .models import Variant
from .models import Product, Category, Brand


class PriceRangeForm(forms.Form):
    def clean(self):
        data = super().clean()
        minimum, maximum = data.get('min_price'), data.get('max_price')
        if minimum is not None and maximum is not None and minimum > maximum:
            raise ValidationError('Minimum price cannot exceed maximum price.')
        return data


class CatalogueOrdering(django_filters.OrderingFilter):
    def filter(self, qs, value):
        if not value:
            return qs
        cheapest = Variant.objects.filter(product_id=OuterRef('pk'), is_active=True).order_by('price', 'pk')
        qs = qs.annotate(catalogue_price=Subquery(cheapest.values('price')[:1]))
        fields = [self.get_ordering_value(item) for item in value]
        return qs.order_by(*fields, 'pk')


class ProductFilter(django_filters.FilterSet):
    slug = django_filters.CharFilter(field_name='slug', lookup_expr='exact')
    # Accept category slug as a string parameter (supports full paths like "skincare/moisturisers")
    category = django_filters.CharFilter(method='filter_category')
    brand = django_filters.ModelMultipleChoiceFilter(
        queryset=Brand.objects.filter(is_active=True),
        field_name='brand__slug',
        to_field_name='slug'
    )
    min_price = django_filters.NumberFilter(method='filter_min_price')
    max_price = django_filters.NumberFilter(method='filter_max_price')
    on_offer = django_filters.BooleanFilter(method='filter_on_offer')
    search = django_filters.CharFilter(method='filter_search')

    ordering = CatalogueOrdering(
        fields=(
            ('created_at', 'newest'),
            ('catalogue_price', 'price'),
            ('name', 'name'),
        ),
        field_labels={
            'created_at': 'Newest',
            'variants__price': 'Price',
            'name': 'Name',
        }
    )

    class Meta:
        model = Product
        fields = []
        form = PriceRangeForm

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        field = self.filters['ordering'].field
        field.choices = [*field.choices, ('created_at', 'Created at'), ('-created_at', 'Newest first')]

    def filter_queryset(self, queryset):
        return super().filter_queryset(queryset).distinct()

    def filter_category(self, queryset, name, value):
        """
        Accepts a category slug, possibly with path segments (e.g. 'skincare/moisturisers').
        Traverses the tree to find the final category, then includes all descendants.
        """
        slug_parts = value.strip('/').split('/')
        # Start from root nodes
        categories = Category.get_root_nodes().filter(is_active=True)
        target = None
        for part in slug_parts:
            try:
                target = categories.get(slug=part, is_active=True)
                categories = target.get_children().filter(is_active=True)
            except Category.DoesNotExist:
                return queryset.none()

        if target is None:
            return queryset.none()

        if target.is_leaf():
            return queryset.filter(category=target)
        else:
            descendants = target.get_descendants(include_self=True)
            return queryset.filter(category__in=descendants)

    def filter_min_price(self, queryset, name, value):
        return self.filter_price_range(queryset)

    def filter_max_price(self, queryset, name, value):
        return self.filter_price_range(queryset)

    def filter_price_range(self, queryset):
        # Both bounds must match the SAME active SKU, without multiplying products.
        variants = Variant.objects.filter(product_id=OuterRef('pk'), is_active=True)
        data = self.form.cleaned_data
        if data.get('min_price') is not None:
            variants = variants.filter(price__gte=data['min_price'])
        if data.get('max_price') is not None:
            variants = variants.filter(price__lte=data['max_price'])
        return queryset.filter(Exists(variants))

    def filter_on_offer(self, queryset, name, value):
        from .promotions import filter_on_offer
        return filter_on_offer(queryset, value)

    def filter_search(self, queryset, name, value):
        return queryset.filter(
            Q(name__icontains=value) |
            Q(brand__name__icontains=value) |
            Q(description__icontains=value)
        )
