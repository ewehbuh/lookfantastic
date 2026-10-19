from django.test import TestCase
from rest_framework.test import APIClient
from products.models import Brand, Product


class DiscoveryTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.brand = Brand.objects.create(name='Alpha Beauty', slug='alpha')
        self.cream = Product.objects.create(name='Night Cream', slug='night-cream', brand=self.brand, description='Hydrating')
        self.other = Product.objects.create(name='Serum', slug='serum', brand=self.brand, description='Night cream alternative')

    def test_relevance_ranks_exact_name_above_description_match(self):
        result = self.client.get('/api/search/?q=night+cream')
        self.assertEqual(result.status_code, 200)
        self.assertEqual([p['id'] for p in result.data['results']], [self.cream.pk, self.other.pk])
        self.assertFalse(result.data['correction_applied'])

    def test_typo_fallback_is_explicit_and_can_be_disabled(self):
        result = self.client.get('/api/search/?q=nght+cream')
        self.assertEqual(result.status_code, 200)
        self.assertTrue(result.data['correction_applied'])
        self.assertEqual(result.data['corrected_query'], 'night cream')
        self.assertEqual(self.client.get('/api/search/?q=nght+cream&typo_correction=false').data['count'], 0)

    def test_correction_respects_filters_and_hidden_catalogue(self):
        hidden = Brand.objects.create(name='Secret Brand', slug='secret', is_active=False)
        Product.objects.create(name='Hiddenproduct', slug='hidden', brand=hidden)
        self.assertEqual(self.client.get('/api/search/?q=hidenproduct').data['count'], 0)
        self.assertEqual(self.client.get('/api/search/?q=nght+cream&slug=missing').data['count'], 0)

    def test_suggestions_are_bounded_and_do_not_expose_hidden_products(self):
        Product.objects.create(name='Night hidden', slug='hidden', brand=self.brand, is_active=False)
        response = self.client.get('/api/search/suggestions/?q=night&limit=1')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['suggestions']), 1)
        self.assertEqual(response.data['suggestions'][0]['slug'], self.cream.slug)
        self.assertEqual(self.client.get('/api/search/suggestions/?q=night&limit=11').status_code, 400)

    def test_brand_suggestions_and_relevance_alias(self):
        response = self.client.get('/api/search/suggestions/?q=alpha')
        self.assertEqual(response.data['suggestions'][0]['type'], 'brand')
        self.assertEqual(self.client.get('/api/search/?q=night&ordering=relevance').status_code, 200)
