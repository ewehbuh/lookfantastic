from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from .models import Brand, Category, Product, Variant, Offer


class CatalogueTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.root = Category.add_root(name='Skincare', slug='skincare')
        cls.child = cls.root.add_child(name='Moisturisers', slug='moisturisers')
        cls.leaf = cls.child.add_child(name='Night creams', slug='night-creams')
        cls.brand = Brand.objects.create(name='Alpha', slug='alpha', featured=True)
        cls.other_brand = Brand.objects.create(name='Beta', slug='beta')
        cls.cream = Product.objects.create(name='Night Cream', slug='cream', brand=cls.brand,
                                           category=cls.leaf, description='Hydrating treatment')
        cls.variant = Variant.objects.create(product=cls.cream, sku='cream-small', price='10', stock=3)
        Variant.objects.create(product=cls.cream, sku='cream-large', price='30', stock=2)
        cls.hidden_variant = Variant.objects.create(product=cls.cream, sku='hidden', price='1', stock=10, is_active=False)
        cls.cleanser = Product.objects.create(name='Cleanser', slug='cleanser', brand=cls.other_brand,
                                              category=cls.root, description='Gentle wash')
        Variant.objects.create(product=cls.cleanser, sku='cleanser', price='5', stock=4)
        cls.hidden = Product.objects.create(name='Hidden', slug='hidden', brand=cls.brand, is_active=False)

    def setUp(self):
        self.client = APIClient()

    def listing(self, **params):
        response = self.client.get('/api/products/', params)
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def offer(self, **kwargs):
        now = timezone.now()
        return Offer.objects.create(name='Offer', slug='offer', offer_type='percentage', value=10,
            valid_from=now - timedelta(days=1), valid_to=now + timedelta(days=1), **kwargs)

    def test_public_catalogue_excludes_inactive_products(self):
        data = self.listing()
        self.assertEqual(data['count'], 2)
        self.assertNotIn(self.hidden.pk, [p['id'] for p in data['results']])
        self.assertEqual(self.client.get(f'/api/products/{self.hidden.pk}/').status_code, 404)

    def test_product_slug_filter_resolves_exact_product(self):
        data = self.listing(slug='cream')
        self.assertEqual([p['id'] for p in data['results']], [self.cream.pk])
        self.assertEqual(self.listing(slug='missing')['count'], 0)

    def test_full_category_path_includes_descendants(self):
        for path in ['skincare/moisturisers', 'skincare/moisturisers/night-creams']:
            with self.subTest(path=path):
                self.assertEqual([p['id'] for p in self.listing(category=path)['results']], [self.cream.pk])
        self.assertEqual(self.listing(category='skincare')['count'], 2)
        self.assertEqual(self.listing(category='wrong/night-creams')['count'], 0)

    def test_search_matches_name_brand_and_description(self):
        for term in ['night', 'ALPHA', 'hydrating']:
            with self.subTest(term=term):
                self.assertEqual([p['id'] for p in self.listing(search=term)['results']], [self.cream.pk])

    def test_brand_filter_and_invalid_brand(self):
        self.assertEqual([p['id'] for p in self.listing(brand='beta')['results']], [self.cleanser.pk])
        self.assertEqual(self.client.get('/api/products/', {'brand': 'missing'}).status_code, 400)

    def test_price_filters_do_not_duplicate_products_or_facets(self):
        data = self.listing(min_price=1)
        self.assertEqual(data['count'], 2)
        self.assertEqual(data['facets']['total_count'], 2)
        self.assertEqual({b['brand__slug']: b['count'] for b in data['facets']['brands']}, {'alpha': 1, 'beta': 1})
        self.assertEqual(Decimal(str(data['facets']['price_range']['min_price'])), Decimal('5'))

    def test_price_range_requires_one_active_variant_in_range(self):
        self.assertEqual(self.listing(min_price=15, max_price=20)['count'], 0)
        self.assertEqual(self.listing(max_price=2)['count'], 0)
        self.assertEqual([p['id'] for p in self.listing(min_price=25, max_price=35)['results']], [self.cream.pk])

    def test_price_sort_uses_lowest_active_price_once_per_product(self):
        data = self.listing(ordering='price')
        self.assertEqual([p['id'] for p in data['results']], [self.cleanser.pk, self.cream.pk])
        self.assertEqual([p['id'] for p in self.listing(ordering='-price')['results']], [self.cream.pk, self.cleanser.pk])

    def test_frontend_created_at_sort_alias_is_accepted(self):
        self.assertEqual(self.client.get('/api/products/', {'ordering': '-created_at'}).status_code, 200)

    def test_invalid_numeric_and_sort_filters_return_400(self):
        for params in [{'min_price': 'wrong'}, {'ordering': 'wrong'}, {'min_price': 20, 'max_price': 10}]:
            with self.subTest(params=params):
                self.assertEqual(self.client.get('/api/products/', params).status_code, 400)

    def test_detail_hides_inactive_variants_and_has_usage_fields(self):
        response = self.client.get(f'/api/products/{self.cream.pk}/')
        self.assertEqual(response.status_code, 200)
        self.assertNotIn(self.hidden_variant.pk, [v['id'] for v in response.data['variants']])
        self.assertEqual(response.data['default_variant']['id'], self.variant.pk)
        self.assertIn('ingredients', response.data)
        self.assertIn('how_to_use', response.data)

    def test_product_without_variants_is_serialized(self):
        empty = Product.objects.create(name='Coming soon', slug='soon', brand=self.brand)
        data = self.listing(slug='soon')['results'][0]
        self.assertEqual(data['id'], empty.pk)
        self.assertIsNone(data['price'])
        self.assertIsNone(data['default_variant'])

    def test_stock_status_considers_all_active_variants(self):
        self.variant.stock = 0
        self.variant.save()
        self.cream.refresh_from_db()
        self.assertTrue(self.cream.in_stock)

    def test_on_offer_flag_and_filter_match_active_direct_offers(self):
        offer = self.offer()
        offer.products.add(self.cream)
        data = self.listing(on_offer='true')
        self.assertEqual([p['id'] for p in data['results']], [self.cream.pk])
        self.assertIs(data['results'][0]['on_offer'], True)
        self.assertEqual([p['id'] for p in self.listing(on_offer='false')['results']], [self.cleanser.pk])

    def test_expired_offers_are_not_advertised(self):
        offer = self.offer()
        offer.valid_to = timezone.now() - timedelta(hours=1)
        offer.save()
        offer.products.add(self.cream)
        self.assertEqual(self.listing(on_offer='true')['count'], 0)
        self.assertEqual(self.client.get(f'/api/products/{self.cream.pk}/').data['offers'], [])

    def test_category_tree_hides_inactive_children(self):
        self.child.is_active = False
        self.child.save()
        response = self.client.get('/api/categories/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]['children'], [])

    def test_category_product_endpoint_applies_filters(self):
        response = self.client.get(f'/api/categories/{self.root.pk}/products/', {'search': 'night'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual([p['id'] for p in response.data['results']], [self.cream.pk])

    def test_brand_product_endpoint_validates_filters(self):
        response = self.client.get(f'/api/brands/{self.brand.pk}/products/', {'min_price': 'wrong'})
        self.assertEqual(response.status_code, 400)

    def test_inactive_brands_and_categories_do_not_leak_products(self):
        self.brand.is_active = False
        self.brand.save()
        self.assertEqual(self.listing(slug='cream')['count'], 0)
        self.assertEqual(self.client.get(f'/api/products/{self.cream.pk}/').status_code, 404)
        self.assertEqual(self.client.get(f'/api/brands/{self.brand.pk}/').status_code, 404)

    def test_homepage_excludes_inactive_featured_brands(self):
        self.brand.is_active = False
        self.brand.save()
        data = self.client.get('/api/products/homepage/').data
        self.assertEqual(data['featured_brands'], [])
        self.assertNotIn(self.cream.pk, [p['id'] for p in data['new_in']])

    def test_bestsellers_rank_paid_sales_not_pending_orders(self):
        from cart.models import Order, OrderItem
        def record(product, quantity, status):
            order = Order.objects.create(email='test@example.com', status=status,
                subtotal='10', total='10', shipping_name='Test', shipping_address='1 Road',
                shipping_city='City', shipping_postcode='123', shipping_country='GB')
            OrderItem.objects.create(order=order, variant=product.default_variant, sku='sku',
                product_name=product.name, quantity=quantity, unit_price='10', line_total='10')
        record(self.cream, 3, 'paid')
        record(self.cleanser, 1, 'paid')
        record(self.cleanser, 100, 'pending')
        ids = [p['id'] for p in self.client.get('/api/products/homepage/').data['bestsellers']]
        self.assertEqual(ids[:2], [self.cream.pk, self.cleanser.pk])

    def test_public_catalogue_is_read_only(self):
        self.assertEqual(self.client.post('/api/products/', {}).status_code, 405)
        self.assertEqual(self.client.patch(f'/api/products/{self.cream.pk}/', {'name': 'Wrong'}).status_code, 405)

    def test_inactive_ancestor_hides_entire_category_subtree(self):
        self.child.is_active = False
        self.child.save()
        self.assertEqual(self.listing(slug='cream')['count'], 0)
        self.assertEqual(self.client.get(f'/api/products/{self.cream.pk}/').status_code, 404)
        self.assertEqual(self.client.get(f'/api/categories/{self.leaf.pk}/').status_code, 404)
        response = self.client.get(f'/api/brands/{self.brand.pk}/products/')
        self.assertEqual(response.data['count'], 0)

    def test_pagination_preserves_unique_products_and_facets(self):
        Product.objects.bulk_create([Product(name=f'Product {n}', slug=f'product-{n}', brand=self.brand)
                                     for n in range(25)])
        first = self.listing()
        second = self.listing(page=2)
        ids = [p['id'] for p in first['results'] + second['results']]
        self.assertEqual(first['count'], 27)
        self.assertEqual(len(first['results']), 24)
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(len(ids), 27)
        self.assertEqual(first['facets']['total_count'], 27)
        self.assertEqual(self.client.get('/api/products/?page=99').status_code, 404)

    def test_brand_listing_and_category_listing_use_same_offer_flag(self):
        offer = self.offer()
        offer.products.add(self.cream)
        for route in [f'/api/categories/{self.child.pk}/products/', f'/api/brands/{self.brand.pk}/products/']:
            with self.subTest(route=route):
                data = self.client.get(route, {'on_offer': 'true'}).data
                self.assertEqual(data['count'], 1)
                self.assertIs(data['results'][0]['on_offer'], True)

    def test_bestsellers_are_empty_without_confirmed_sales(self):
        self.assertEqual(self.client.get('/api/products/homepage/').data['bestsellers'], [])


class ProductAdminTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.staff = get_user_model().objects.create_user(email='staff@example.com', is_staff=True)
        self.root = Category.add_root(name='Skincare', slug='skincare')
        self.child = self.root.add_child(name='Creams', slug='creams')
        self.brand = Brand.objects.create(name='Brand', slug='brand')
        self.product = Product.objects.create(name='Cream', slug='cream', brand=self.brand)

    def test_management_requires_staff(self):
        for route in ['products', 'categories', 'brands', 'variants', 'offers', 'images']:
            with self.subTest(route=route):
                self.assertEqual(self.client.get(f'/api/admin/{route}/').status_code, 401)
                self.assertEqual(self.client.post(f'/api/admin/{route}/', {}).status_code, 401)
        user = get_user_model().objects.create_user(email='shopper@example.com')
        self.client.force_authenticate(user)
        self.assertEqual(self.client.get('/api/admin/products/').status_code, 403)
        self.assertEqual(self.client.patch(f'/api/admin/products/{self.product.pk}/', {'name': 'Changed'}).status_code, 403)

    def test_staff_can_create_edit_and_delete_product(self):
        self.client.force_authenticate(self.staff)
        result = self.client.post('/api/admin/products/', {'name': 'Serum', 'slug': 'serum',
            'brand': self.brand.pk, 'description': 'Treatment'})
        self.assertEqual(result.status_code, 201, result.data)
        route = f"/api/admin/products/{result.data['id']}/"
        self.assertEqual(self.client.patch(route, {'name': 'Updated'}).status_code, 200)
        self.assertEqual(self.client.delete(route).status_code, 204)

    def test_category_patch_without_parent_preserves_tree(self):
        self.client.force_authenticate(self.staff)
        response = self.client.patch(f'/api/admin/categories/{self.child.pk}/', {'description': 'Updated'})
        self.assertEqual(response.status_code, 200, response.data)
        self.child.refresh_from_db()
        self.assertEqual(self.child.get_parent().pk, self.root.pk)

    def test_category_cannot_move_inside_itself_or_its_descendant(self):
        self.client.force_authenticate(self.staff)
        for parent in [self.root, self.child]:
            with self.subTest(parent=parent.pk):
                self.assertEqual(self.client.patch(f'/api/admin/categories/{self.root.pk}/',
                    {'parent_id': parent.pk}, format='json').status_code, 400)

    def test_category_move_with_sorted_tree_is_supported(self):
        self.client.force_authenticate(self.staff)
        other = Category.add_root(name='Hair', slug='hair')
        response = self.client.patch(f'/api/admin/categories/{self.child.pk}/', {'parent_id': other.pk}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.child.refresh_from_db()
        self.assertEqual(self.child.get_parent().pk, other.pk)

    def test_variant_rejects_negative_prices_and_stock(self):
        self.client.force_authenticate(self.staff)
        for values in [{'price': '-1', 'stock': 3}, {'price': '10', 'stock': -1}]:
            with self.subTest(values=values):
                response = self.client.post('/api/admin/variants/', {'product': self.product.pk, 'sku': 'invalid', **values})
                self.assertEqual(response.status_code, 400)

    def test_offer_rejects_invalid_dates_and_percentage(self):
        self.client.force_authenticate(self.staff)
        now = timezone.now()
        base = {'name': 'Sale', 'slug': 'sale', 'offer_type': 'percentage', 'value': '10',
                'valid_from': now.isoformat(), 'valid_to': (now + timedelta(days=1)).isoformat()}
        for changes in [{'value': '-1'}, {'value': '101'}, {'valid_to': (now - timedelta(days=1)).isoformat()}]:
            with self.subTest(changes=changes):
                self.assertEqual(self.client.post('/api/admin/offers/', {**base, **changes}).status_code, 400)

    def test_explicit_null_parent_promotes_category_to_root(self):
        self.client.force_authenticate(self.staff)
        response = self.client.patch(f'/api/admin/categories/{self.child.pk}/', {'parent_id': None}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.child.refresh_from_db()
        self.assertTrue(self.child.is_root())
        self.assertTrue(all(not problems for problems in Category.find_problems()))

    def test_variant_reference_price_cannot_be_below_selling_price(self):
        self.client.force_authenticate(self.staff)
        variant = Variant.objects.create(product=self.product, sku='valid', price='10', stock=3)
        response = self.client.patch(f'/api/admin/variants/{variant.pk}/', {'compare_at_price': '5'})
        self.assertEqual(response.status_code, 400)
        variant.refresh_from_db()
        self.assertIsNone(variant.compare_at_price)

    def test_valid_offer_creation_and_invalid_partial_update(self):
        self.client.force_authenticate(self.staff)
        now = timezone.now()
        response = self.client.post('/api/admin/offers/', {'name': 'Sale', 'slug': 'sale',
            'offer_type': 'percentage', 'value': '10', 'valid_from': now.isoformat(),
            'valid_to': (now + timedelta(days=1)).isoformat(), 'products': [self.product.pk]}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        offer = Offer.objects.get(pk=response.data['id'])
        self.assertEqual(list(offer.products.values_list('pk', flat=True)), [self.product.pk])
        self.assertEqual(self.client.patch(f'/api/admin/offers/{offer.pk}/', {'value': 101}).status_code, 400)
        offer.refresh_from_db()
        self.assertEqual(offer.value, Decimal('10'))
