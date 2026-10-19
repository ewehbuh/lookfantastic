from django.test import TestCase
from rest_framework.test import APIClient
from products.models import Brand, Category, Product, Variant


class ProductSearchTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.category = Category.add_root(name='Skincare', slug='skincare')
        cls.brand = Brand.objects.create(name='Alpha Beauty', slug='alpha')
        cls.other_brand = Brand.objects.create(name='Beta', slug='beta')
        cls.cream = Product.objects.create(name='Night Cream', slug='night-cream', brand=cls.brand,
            category=cls.category, description='Hydrating moisturiser')
        Variant.objects.create(product=cls.cream, sku='NIGHT-50ML', price='10', stock=2)
        Variant.objects.create(product=cls.cream, sku='NIGHT-100ML', price='20', stock=2)
        Variant.objects.create(product=cls.cream, sku='SECRET-OLD', price='1', is_active=False)
        cls.cleanser = Product.objects.create(name='Gentle Cleanser', slug='cleanser', brand=cls.other_brand,
            description='Night routine')
        Variant.objects.create(product=cls.cleanser, sku='CLEANSER', price='5', stock=2)

    def setUp(self):
        self.client = APIClient()

    def search(self, query, **params):
        response = self.client.get('/api/search/', {'q': query, **params})
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def test_public_search_by_name_brand_and_description(self):
        for query in ['CREAM', 'alpha', 'moisturiser']:
            with self.subTest(query=query):
                self.assertEqual([p['id'] for p in self.search(query)['results']], [self.cream.pk])

    def test_terms_can_match_different_fields_but_all_are_required(self):
        self.assertEqual([p['id'] for p in self.search('Alpha hydrating')['results']], [self.cream.pk])
        self.assertEqual(self.search('Alpha cleanser')['count'], 0)

    def test_query_whitespace_is_normalized(self):
        response = self.search('  Alpha \t hydrating  ')
        self.assertEqual(response['query'], 'Alpha hydrating')
        self.assertEqual(response['count'], 1)

    def test_search_alias_has_same_semantics(self):
        result = self.client.get('/api/search/', {'search': 'Alpha hydrating'})
        self.assertEqual(result.status_code, 200)
        self.assertEqual([p['id'] for p in result.data['results']], [self.cream.pk])

    def test_missing_blank_and_overlong_queries_are_rejected(self):
        for params in [{}, {'q': ''}, {'q': '   '}, {'q': 'a' * 201}, {'q': ' '.join(['word'] * 11)}]:
            with self.subTest(params=params):
                self.assertEqual(self.client.get('/api/search/', params).status_code, 400)

    def test_ambiguous_queries_are_rejected(self):
        for params in [{'q': ['cream', 'cleanser']}, {'q': 'cream', 'search': 'cleanser'}]:
            with self.subTest(params=params):
                self.assertEqual(self.client.get('/api/search/', params).status_code, 400)

    def test_active_sku_search_does_not_duplicate_products(self):
        response = self.search('NIGHT-')
        self.assertEqual(response['count'], 1)
        self.assertEqual(response['facets']['total_count'], 1)
        self.assertEqual(response['facets']['brands'][0]['count'], 1)
        self.assertEqual(self.search('SECRET-OLD')['count'], 0)

    def test_hidden_products_and_brands_do_not_leak(self):
        hidden = Product.objects.create(name='Night hidden', slug='hidden', brand=self.brand, is_active=False)
        inactive_brand = Brand.objects.create(name='Night brand', slug='hidden-brand', is_active=False)
        Product.objects.create(name='Night hidden brand', slug='hidden-brand-product', brand=inactive_brand)
        ids = [p['id'] for p in self.search('Night')['results']]
        self.assertEqual(set(ids), {self.cream.pk, self.cleanser.pk})
        self.assertNotIn(hidden.pk, ids)

    def test_hidden_category_ancestry_is_respected(self):
        self.category.is_active = False
        self.category.save()
        self.assertEqual(self.search('cream')['count'], 0)
        self.assertEqual(self.search('cleanser')['count'], 1)

    def test_existing_catalogue_filters_combine_with_query(self):
        self.assertEqual([p['id'] for p in self.search('night', brand='alpha')['results']], [self.cream.pk])
        self.assertEqual([p['id'] for p in self.search('night', category='skincare')['results']], [self.cream.pk])
        self.assertEqual([p['id'] for p in self.search('night', min_price=15, max_price=25)['results']], [self.cream.pk])
        self.assertEqual(self.search('night', min_price=11, max_price=19)['count'], 0)

    def test_sorting_is_shared_with_catalogue(self):
        ids = [p['id'] for p in self.search('night', ordering='price')['results']]
        self.assertEqual(ids, [self.cleanser.pk, self.cream.pk])
        ids = [p['id'] for p in self.search('night', ordering='-price')['results']]
        self.assertEqual(ids, [self.cream.pk, self.cleanser.pk])

    def test_invalid_filters_return_validation_errors(self):
        for params in [{'min_price': 'invalid'}, {'min_price': 30, 'max_price': 10},
                       {'ordering': 'invalid'}, {'brand': 'missing'}]:
            with self.subTest(params=params):
                self.assertEqual(self.client.get('/api/search/', {'q': 'night', **params}).status_code, 400)

    def test_no_matches_return_empty_results_and_facets(self):
        response = self.search('no-such-product')
        self.assertEqual(response['count'], 0)
        self.assertEqual(response['results'], [])
        self.assertEqual(response['facets']['brands'], [])

    def test_pagination_keeps_query_and_returns_unique_products(self):
        Product.objects.bulk_create([Product(name=f'Night product {n}', slug=f'night-{n}', brand=self.brand)
                                     for n in range(25)])
        first = self.search('night')
        self.assertEqual(first['count'], 27)
        self.assertIn('q=night', first['next'])
        second = self.search('night', page=2)
        ids = [p['id'] for p in first['results'] + second['results']]
        self.assertEqual(len(ids), 27)
        self.assertEqual(len(set(ids)), 27)
        self.assertEqual(self.client.get('/api/search/?q=night&page=99').status_code, 404)

    def test_search_is_read_only(self):
        self.assertEqual(self.client.post('/api/search/', {'q': 'night'}).status_code, 405)
        self.assertEqual(self.client.delete('/api/search/').status_code, 405)

    def test_punctuation_and_sql_like_input_are_treated_as_text(self):
        self.assertEqual(self.search("' OR 1=1 --")['count'], 0)
        self.assertEqual(self.search('<script>alert(1)</script>')['count'], 0)

    def test_specific_sku_match_keeps_product_level_price_facets(self):
        response = self.search('NIGHT-100ML')
        self.assertEqual(response['count'], 1)
        self.assertEqual(response['results'][0]['price'], '10.00')
        self.assertEqual(float(response['facets']['price_range']['min_price']), 10.0)
        self.assertEqual(float(response['facets']['price_range']['max_price']), 20.0)
