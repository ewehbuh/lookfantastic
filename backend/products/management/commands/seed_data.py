from django.core.management.base import BaseCommand
from products.models import Category, Brand, Product, Variant, Offer, ProductOffer
from django.utils import timezone
from decimal import Decimal
import datetime

class Command(BaseCommand):
    help = 'Seed sample data for Lookfantastic-like store'

    def handle(self, *args, **kwargs):
        # Categories
        skincare = Category.add_root(name='Skincare', slug='skincare')
        moisturisers = skincare.add_child(name='Moisturisers', slug='moisturisers')
        night_cream = moisturisers.add_child(name='Night Creams', slug='night-creams')
        serums = skincare.add_child(name='Serums', slug='serums')
        haircare = Category.add_root(name='Hair', slug='hair')
        shampoo = haircare.add_child(name='Shampoo', slug='shampoo')

        # Brands
        brand1 = Brand.objects.create(name='Brand A', slug='brand-a', featured=True)
        brand2 = Brand.objects.create(name='Brand B', slug='brand-b')

        # Products
        p1 = Product.objects.create(
            name='Hydrating Night Cream',
            slug='hydrating-night-cream-123',
            brand=brand1,
            category=night_cream,
            description='A rich night cream for dry skin.',
            how_to_use='Apply before bed.',
            ingredients='Water, Glycerin...'
        )
        Variant.objects.create(product=p1, sku='NC-50', size='50ml', price=Decimal('29.99'), stock=100)
        Variant.objects.create(product=p1, sku='NC-100', size='100ml', price=Decimal('49.99'), stock=50)

        p2 = Product.objects.create(
            name='Volume Shampoo',
            slug='volume-shampoo-456',
            brand=brand2,
            category=shampoo,
            description='Adds volume and body.',
            how_to_use='Massage into wet hair.',
            ingredients='Aqua, Sodium Laureth Sulfate...'
        )
        Variant.objects.create(product=p2, sku='VS-250', size='250ml', price=Decimal('12.99'), stock=200)

        # Offer
        offer = Offer.objects.create(
            name='Summer Sale',
            slug='summer-sale',
            offer_type='percentage',
            value=20,
            valid_from=timezone.now() - datetime.timedelta(days=1),
            valid_to=timezone.now() + datetime.timedelta(days=30),
            is_active=True
        )
        offer.products.add(p1)

        self.stdout.write(self.style.SUCCESS('Seed data created successfully!'))
