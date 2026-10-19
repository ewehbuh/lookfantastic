import django_filters
from django.db.models import Q
from .models import Product, Category, Brand


class ProductFilter(django_filters.FilterSet):
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

    ordering = django_filters.OrderingFilter(
        fields=(
            ('created_at', 'newest'),
            ('variants__price', 'price'),
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
        return queryset.filter(variants__price__gte=value, variants__is_active=True)

    def filter_max_price(self, queryset, name, value):
        return queryset.filter(variants__price__lte=value, variants__is_active=True)

    def filter_on_offer(self, queryset, name, value):
        from django.utils import timezone
        now = timezone.now()
        if value:
            return queryset.filter(
                offers__is_active=True,
                offers__valid_from__lte=now,
                offers__valid_to__gte=now
            ).distinct()
        return queryset

    def filter_search(self, queryset, name, value):
        return queryset.filter(
            Q(name__icontains=value) |
            Q(brand__name__icontains=value) |
            Q(description__icontains=value)
        )
