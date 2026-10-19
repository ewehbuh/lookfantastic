from django.contrib import admin
from treebeard.admin import TreeAdmin
from .models import Category, Brand, Product, Variant, Offer, ProductOffer, ProductImage


@admin.register(Category)
class CategoryAdmin(TreeAdmin):
    prepopulated_fields = {'slug': ('name',)}


@admin.register(Brand)
class BrandAdmin(admin.ModelAdmin):
    list_display = ['name', 'featured', 'is_active']
    prepopulated_fields = {'slug': ('name',)}


class VariantInline(admin.TabularInline):
    model = Variant
    extra = 1


class ProductImageInline(admin.TabularInline):
    model = ProductImage
    extra = 1


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ['name', 'brand', 'category', 'is_active', 'price']
    list_filter = ['brand', 'category', 'is_active']
    search_fields = ['name', 'description']
    prepopulated_fields = {'slug': ('name',)}
    inlines = [VariantInline, ProductImageInline]


@admin.register(Offer)
class OfferAdmin(admin.ModelAdmin):
    list_display = ['name', 'offer_type', 'value', 'valid_from', 'valid_to', 'is_active']
    filter_horizontal = ['categories', 'brands']
