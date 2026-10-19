"""Portable catalogue relevance and bounded, visible-catalogue typo candidates."""
import re
from difflib import get_close_matches
from django.db.models import Q, Exists, OuterRef, Case, When, Value, IntegerField
from products.models import Variant


def match(queryset, query):
    for term in query.split():
        skus = Variant.objects.filter(product_id=OuterRef('pk'), is_active=True, sku__icontains=term)
        queryset = queryset.filter(Q(name__icontains=term) | Q(brand__name__icontains=term) |
                                   Q(description__icontains=term) | Q(Exists(skus)))
    return queryset


def rank(queryset, query):
    score = Case(When(name__iexact=query, then=Value(100)),
                 When(name__istartswith=query, then=Value(60)), default=Value(0), output_field=IntegerField())
    for term in query.split():
        score = score + Case(When(name__icontains=term, then=Value(20)),
                            When(brand__name__icontains=term, then=Value(10)),
                            default=Value(1), output_field=IntegerField())
    return queryset.annotate(search_rank=score).order_by('-search_rank', '-created_at', '-pk')


def corrected_query(base, query):
    words = set()
    # Deterministically bound CPU/memory for the initial database-backed search.
    for name, brand in base.order_by('pk').values_list('name', 'brand__name')[:1000]:
        words.update(re.findall(r'\w+', (name + ' ' + brand).casefold()))
    vocabulary = sorted(words)
    corrected = []
    for term in query.split():
        if len(term) < 3 or match(base, term).exists():
            corrected.append(term)
            continue
        close = get_close_matches(term.casefold(), vocabulary, n=1, cutoff=0.78)
        corrected.append(close[0] if close else term)
    value = ' '.join(corrected)
    return value if value.casefold() != query.casefold() else None
