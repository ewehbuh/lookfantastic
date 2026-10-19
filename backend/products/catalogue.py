"""Shared visibility rules for public catalogue endpoints."""
from django.db.models import Exists, F, OuterRef, Q, ExpressionWrapper, CharField
from .models import Category, Product


def visible_categories():
    # Exclude an active child if any ancestor is inactive as well.
    hidden = Category.objects.filter(is_active=False).annotate(
        child_path=ExpressionWrapper(OuterRef('path'), output_field=CharField())).filter(child_path__startswith=F('path'))
    return Category.objects.filter(is_active=True).annotate(
        hidden_ancestor=Exists(hidden)).filter(hidden_ancestor=False)


def visible_products():
    return Product.objects.filter(is_active=True, brand__is_active=True).filter(
        Q(category__isnull=True) | Q(category__in=visible_categories()))
