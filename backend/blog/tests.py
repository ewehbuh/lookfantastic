from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from products.models import Brand, Product, Category
from .models import Article, ArticleCategory


class PublicBlogTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.category = ArticleCategory.objects.create(name='Skincare', slug='skincare')
        cls.now = timezone.now()
        cls.article = Article.objects.create(title='Skin Guide', slug='skin-guide', category=cls.category,
            excerpt='Daily routine', body='<p>Moisturising advice</p>', is_published=True,
            published_at=cls.now - timedelta(days=1), meta_title='Skin advice')
        cls.other = Article.objects.create(title='Hair Guide', slug='hair-guide', body='<p>Hair care</p>',
            is_published=True, published_at=cls.now - timedelta(days=2))
        cls.draft = Article.objects.create(title='Draft', slug='draft', body='Secret draft')
        cls.future = Article.objects.create(title='Scheduled', slug='scheduled', body='Future article',
            is_published=True, published_at=cls.now + timedelta(days=1))

    def setUp(self):
        self.client = APIClient()

    def test_publication_visibility_applies_to_list_and_detail(self):
        response = self.client.get('/api/blog/articles/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 2)
        for article in [self.draft, self.future]:
            self.assertEqual(self.client.get(f'/api/blog/articles/{article.pk}/').status_code, 404)
        self.assertEqual(self.client.get(f'/api/blog/articles/{self.article.pk}/').status_code, 200)

    def test_exact_slug_lookup_and_missing_slug(self):
        response = self.client.get('/api/blog/articles/', {'slug': 'skin-guide'})
        self.assertEqual([a['id'] for a in response.data['results']], [self.article.pk])
        self.assertEqual(self.client.get('/api/blog/articles/', {'slug': 'missing'}).data['count'], 0)

    def test_schedule_is_evaluated_per_request_without_restart(self):
        with patch('blog.views.now', return_value=self.now + timedelta(days=2)):
            response = self.client.get(f'/api/blog/articles/{self.future.pk}/')
        self.assertEqual(response.status_code, 200)

    def test_inactive_article_category_hides_articles(self):
        self.category.is_active = False
        self.category.save()
        self.assertEqual(self.client.get('/api/blog/categories/').data['count'], 0)
        self.assertEqual(self.client.get(f'/api/blog/categories/{self.category.pk}/').status_code, 404)
        self.assertEqual(self.client.get(f'/api/blog/articles/{self.article.pk}/').status_code, 404)
        self.assertEqual(self.client.get('/api/blog/articles/').data['count'], 1)

    def test_search_matches_title_excerpt_and_body(self):
        for term in ['SKIN', 'Daily', 'Moisturising']:
            with self.subTest(term=term):
                response = self.client.get('/api/blog/articles/', {'search': term})
                self.assertEqual([a['id'] for a in response.data['results']], [self.article.pk])

    def test_category_filter_and_sorting(self):
        response = self.client.get('/api/blog/articles/', {'category__slug': 'skincare'})
        self.assertEqual([a['id'] for a in response.data['results']], [self.article.pk])
        response = self.client.get('/api/blog/articles/', {'ordering': 'title'})
        self.assertEqual([a['id'] for a in response.data['results']], [self.other.pk, self.article.pk])

    def test_related_products_use_catalogue_visibility(self):
        brand = Brand.objects.create(name='Brand', slug='brand')
        active = Product.objects.create(name='Cream', slug='cream', brand=brand)
        inactive = Product.objects.create(name='Hidden', slug='hidden', brand=brand, is_active=False)
        hidden_brand = Brand.objects.create(name='Hidden brand', slug='hidden-brand', is_active=False)
        hidden_brand_product = Product.objects.create(name='Hidden brand product', slug='hidden-brand-product', brand=hidden_brand)
        hidden_category = Category.add_root(name='Hidden category', slug='hidden-category', is_active=False)
        hidden_category_product = Product.objects.create(name='Hidden category product', slug='hidden-category-product',
                                                         brand=brand, category=hidden_category)
        self.article.related_products.add(active, inactive, hidden_brand_product, hidden_category_product)
        response = self.client.get(f'/api/blog/articles/{self.article.pk}/')
        self.assertEqual([p['id'] for p in response.data['related_products']], [active.pk])

    def test_html_sanitizes_legacy_content_without_mutating_database(self):
        unsafe = '<h2>Advice</h2><script>alert(1)</script><a href="javascript:alert(1)">Bad</a><img src="x" onerror="alert(1)">'
        Article.objects.filter(pk=self.article.pk).update(body=unsafe)
        response = self.client.get(f'/api/blog/articles/{self.article.pk}/')
        body = response.data['body']
        self.assertIn('<h2>Advice</h2>', body)
        self.assertNotIn('<script', body)
        self.assertNotIn('javascript:', body)
        self.assertNotIn('onerror', body)
        self.article.refresh_from_db()
        self.assertEqual(self.article.body, unsafe)

    def test_safe_editorial_html_is_preserved(self):
        content = '<p>Hello <strong>world</strong></p><a href="https://example.com">Link</a>'
        Article.objects.filter(pk=self.article.pk).update(body=content)
        response = self.client.get(f'/api/blog/articles/{self.article.pk}/')
        self.assertIn('<strong>world</strong>', response.data['body'])
        self.assertIn('href="https://example.com"', response.data['body'])

    def test_pagination_is_stable_for_equal_publication_times(self):
        Article.objects.bulk_create([Article(title=f'Article {n}', slug=f'article-{n}', body='Text',
            is_published=True, published_at=self.now - timedelta(days=3)) for n in range(25)])
        first = self.client.get('/api/blog/articles/').data
        second = self.client.get('/api/blog/articles/?page=2').data
        ids = [a['id'] for a in first['results'] + second['results']]
        self.assertEqual(first['count'], 27)
        self.assertEqual(len(ids), 27)
        self.assertEqual(len(set(ids)), 27)
        self.assertEqual(self.client.get('/api/blog/articles/?page=99').status_code, 404)

    def test_public_endpoints_are_read_only(self):
        for route in ['/api/blog/articles/', '/api/blog/categories/']:
            self.assertEqual(self.client.post(route, {}).status_code, 405)
        self.assertEqual(self.client.patch(f'/api/blog/articles/{self.article.pk}/', {'title': 'Changed'}).status_code, 405)


class BlogAdminTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.staff = get_user_model().objects.create_user(email='editor@example.com', is_staff=True)
        self.category = ArticleCategory.objects.create(name='Skin', slug='skin')
        self.payload = {'title': 'Advice', 'slug': 'advice', 'body': '<p>Useful advice</p>'}

    def test_management_requires_staff(self):
        for route in ['/api/blog/admin/articles/', '/api/blog/admin/categories/', '/api/admin/articles/']:
            self.assertEqual(self.client.get(route).status_code, 401)
            self.assertEqual(self.client.post(route, self.payload).status_code, 401)
        user = get_user_model().objects.create_user(email='shopper@example.com')
        self.client.force_authenticate(user)
        for route in ['/api/blog/admin/articles/', '/api/blog/admin/categories/', '/api/admin/articles/']:
            self.assertEqual(self.client.get(route).status_code, 403)
            self.assertEqual(self.client.post(route, self.payload).status_code, 403)

    def test_create_draft_without_optional_related_products(self):
        self.client.force_authenticate(self.staff)
        response = self.client.post('/api/blog/admin/articles/', self.payload)
        self.assertEqual(response.status_code, 201, response.data)
        article = Article.objects.get(pk=response.data['id'])
        self.assertFalse(article.is_published)
        self.assertEqual(article.author_id, self.staff.pk)
        self.assertEqual(self.client.get(f'/api/blog/articles/{article.pk}/').status_code, 404)

    def test_frontend_admin_alias_accepts_category_id(self):
        self.client.force_authenticate(self.staff)
        response = self.client.post('/api/admin/articles/', {**self.payload, 'category_id': self.category.pk})
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Article.objects.get(pk=response.data['id']).category_id, self.category.pk)
        self.assertEqual(response.data['category']['id'], self.category.pk)
        canonical = self.client.get(f"/api/blog/admin/articles/{response.data['id']}/")
        self.assertEqual(canonical.data['category'], self.category.pk)

    def test_related_products_accept_valid_product_ids_and_reject_invalid(self):
        self.client.force_authenticate(self.staff)
        brand = Brand.objects.create(name='Brand', slug='brand')
        product = Product.objects.create(name='Cream', slug='cream', brand=brand)
        response = self.client.post('/api/blog/admin/articles/', {**self.payload, 'related_products': [product.pk]}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        route = f"/api/blog/admin/articles/{response.data['id']}/"
        self.assertEqual(self.client.patch(route, {'related_products': [999999]}, format='json').status_code, 400)
        self.assertEqual(self.client.patch(route, {'related_products': []}, format='json').status_code, 200)
        self.assertEqual(Article.objects.get(pk=response.data['id']).related_products.count(), 0)

    def test_publishing_without_date_sets_timestamp_and_preserves_it_on_edit(self):
        self.client.force_authenticate(self.staff)
        response = self.client.post('/api/blog/admin/articles/', {**self.payload, 'is_published': True}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        article = Article.objects.get(pk=response.data['id'])
        self.assertIsNotNone(article.published_at)
        self.assertLessEqual(article.published_at, timezone.now())
        original = article.published_at
        route = f'/api/blog/admin/articles/{article.pk}/'
        self.assertEqual(self.client.patch(route, {'title': 'Edited'}).status_code, 200)
        article.refresh_from_db()
        self.assertEqual(article.published_at, original)
        self.assertEqual(self.client.get(f'/api/blog/articles/{article.pk}/').status_code, 200)

    def test_future_publication_date_is_preserved(self):
        self.client.force_authenticate(self.staff)
        future = timezone.now() + timedelta(days=2)
        response = self.client.post('/api/blog/admin/articles/', {**self.payload, 'is_published': True,
            'published_at': future.isoformat(), 'related_products': []}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        article = Article.objects.get(pk=response.data['id'])
        self.assertEqual(article.published_at, future)
        self.assertEqual(self.client.get(f'/api/blog/articles/{article.pk}/').status_code, 404)

    def test_article_and_category_crud(self):
        self.client.force_authenticate(self.staff)
        category = self.client.post('/api/blog/admin/categories/', {'name': 'Hair', 'slug': 'hair'})
        self.assertEqual(category.status_code, 201)
        response = self.client.post('/api/blog/admin/articles/', {**self.payload, 'category': category.data['id'],
                                                               'related_products': []}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        route = f"/api/blog/admin/articles/{response.data['id']}/"
        self.assertEqual(self.client.patch(route, {'excerpt': 'Updated'}).status_code, 200)
        self.assertEqual(self.client.get(route).status_code, 200)
        self.assertEqual(self.client.delete(route).status_code, 204)
        self.assertEqual(self.client.delete(f"/api/blog/admin/categories/{category.data['id']}/").status_code, 204)

    def test_admin_html_is_sanitized_on_write(self):
        self.client.force_authenticate(self.staff)
        response = self.client.post('/api/blog/admin/articles/', {**self.payload,
            'body': '<p onclick="bad()">Text</p><iframe src="https://bad.example"></iframe>',
            'related_products': []}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        stored = Article.objects.get(pk=response.data['id']).body
        self.assertIn('<p>Text</p>', stored)
        self.assertNotIn('onclick', stored)
        self.assertNotIn('<iframe', stored)

    def test_duplicate_slug_and_invalid_category_return_validation_errors(self):
        self.client.force_authenticate(self.staff)
        Article.objects.create(**self.payload)
        response = self.client.post('/api/blog/admin/articles/', {**self.payload, 'related_products': []}, format='json')
        self.assertEqual(response.status_code, 400)
        response = self.client.post('/api/blog/admin/articles/', {**self.payload, 'slug': 'other',
            'category': 999999, 'related_products': []}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_conflicting_category_fields_do_not_create_article(self):
        self.client.force_authenticate(self.staff)
        other = ArticleCategory.objects.create(name='Hair', slug='hair')
        response = self.client.post('/api/blog/admin/articles/', {**self.payload,
            'category': self.category.pk, 'category_id': other.pk}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Article.objects.count(), 0)

    def test_unpublishing_immediately_removes_public_access(self):
        self.client.force_authenticate(self.staff)
        article = Article.objects.create(**self.payload, is_published=True, published_at=timezone.now())
        response = self.client.patch(f'/api/blog/admin/articles/{article.pk}/', {'is_published': False}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get(f'/api/blog/articles/{article.pk}/').status_code, 404)

    def test_partial_update_preserves_author_category_and_related_products(self):
        self.client.force_authenticate(self.staff)
        brand = Brand.objects.create(name='Brand', slug='brand')
        product = Product.objects.create(name='Cream', slug='cream', brand=brand)
        article = Article.objects.create(**self.payload, author=self.staff, category=self.category)
        article.related_products.add(product)
        self.assertEqual(self.client.patch(f'/api/admin/articles/{article.pk}/', {'title': 'Edited'}).status_code, 200)
        article.refresh_from_db()
        self.assertEqual(article.author_id, self.staff.pk)
        self.assertEqual(article.category_id, self.category.pk)
        self.assertEqual(list(article.related_products.values_list('pk', flat=True)), [product.pk])
