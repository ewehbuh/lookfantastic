from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from .models import Brand, Category, Product, Variant, Offer, ProductOffer, Review
from .promotions import quote_line
from cart.models import Order, OrderItem

User = get_user_model()


class PromotionsAndReviewsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(email='one@example.com')
        self.other = User.objects.create_user(email='two@example.com')
        self.staff = User.objects.create_user(email='staff@example.com', is_staff=True)
        self.root = Category.add_root(name='Skin', slug='skin')
        self.child = self.root.add_child(name='Cream', slug='cream')
        self.brand = Brand.objects.create(name='Alpha', slug='alpha')
        self.product = Product.objects.create(name='Cream', slug='cream', brand=self.brand, category=self.child)
        self.variant = Variant.objects.create(product=self.product, sku='cream', price='10', stock=20)

    def offer(self, kind='percentage', value='20', **kwargs):
        now = timezone.now()
        return Offer.objects.create(name='Sale', slug='sale-'+str(Offer.objects.count()), offer_type=kind, value=value,
            valid_from=now-timezone.timedelta(days=1), valid_to=now+timezone.timedelta(days=1), **kwargs)

    def test_brand_and_ancestor_category_offers_match_pricing_and_filter(self):
        offer = self.offer()
        offer.categories.add(self.root)
        self.assertEqual(quote_line(self.variant, 2)['line_total'], Decimal('16.00'))
        self.assertEqual(self.client.get('/api/products/?on_offer=true').data['count'], 1)
        self.assertTrue(self.client.get(f'/api/products/{self.product.pk}/').data['offers'])
        offer.categories.clear()
        offer.brands.add(self.brand)
        self.assertEqual(quote_line(self.variant, 2)['line_total'], Decimal('16.00'))
        self.assertEqual(self.client.get('/api/products/?on_offer=false').data['count'], 0)

    def test_product_override_and_best_offer_do_not_stack(self):
        offer = self.offer(value='10')
        ProductOffer.objects.create(offer=offer, product=self.product, additional_value='30')
        other = self.offer(kind='fixed', value='2')
        other.products.add(self.product)
        quote = quote_line(self.variant, 2)
        self.assertEqual(quote['line_total'], Decimal('14.00'))
        self.assertEqual(quote['offer_id'], offer.pk)

    def test_buy_two_get_one_uses_complete_same_sku_groups(self):
        offer = self.offer(kind='buy_x_get_y', value='0', buy_quantity=2, free_quantity=1)
        offer.products.add(self.product)
        for quantity, total in [(1, '10'), (2, '20'), (3, '20'), (4, '30'), (6, '40')]:
            self.assertEqual(quote_line(self.variant, quantity)['line_total'], Decimal(total))

    def test_expired_disabled_and_unrelated_offers_do_not_apply(self):
        offer = self.offer()
        offer.products.add(self.product)
        offer.valid_to = timezone.now()-timezone.timedelta(hours=1)
        offer.save()
        self.assertEqual(quote_line(self.variant, 1)['line_total'], Decimal('10'))
        self.assertFalse(self.product.on_offer)

    def test_staff_can_configure_bogo_and_overrides_with_validation(self):
        self.client.force_authenticate(self.staff)
        now = timezone.now()
        response = self.client.post('/api/admin/offers/', {'name': 'Deal', 'slug': 'deal',
            'offer_type': 'buy_x_get_y', 'value': '0', 'buy_quantity': 2, 'free_quantity': 1,
            'valid_from': now.isoformat(), 'valid_to': (now+timezone.timedelta(days=1)).isoformat()})
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(self.client.patch(f"/api/admin/offers/{response.data['id']}/", {'buy_quantity': 0}).status_code, 400)
        offer = self.offer()
        response = self.client.post('/api/admin/product-offers/', {'product': self.product.pk, 'offer': offer.pk, 'additional_value': '25'})
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(self.client.patch(f"/api/admin/product-offers/{response.data['id']}/", {'additional_value': '101'}).status_code, 400)

    def post_review(self):
        self.client.force_authenticate(self.user)
        return self.client.post('/api/reviews/', {'product': self.product.pk, 'rating': 4, 'title': 'Good', 'body': 'Useful cream', 'is_approved': True})

    def test_reviews_require_login_and_start_pending(self):
        self.assertEqual(self.client.post('/api/reviews/', {}).status_code, 401)
        response = self.post_review()
        self.assertEqual(response.status_code, 201, response.data)
        self.assertFalse(response.data['is_approved'])
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get('/api/reviews/').data['count'], 0)
        self.assertEqual(self.client.get(f'/api/products/{self.product.pk}/').data['review_count'], 0)

    def test_moderation_changes_public_summary_and_author_edits_hide_again(self):
        response = self.post_review()
        pk = response.data['id']
        self.client.force_authenticate(self.staff)
        moderated = self.client.patch(f'/api/admin/reviews/{pk}/', {'is_approved': True, 'rating': 1})
        self.assertEqual(moderated.status_code, 200)
        self.assertEqual(Review.objects.get(pk=pk).rating, 4)
        self.client.force_authenticate(None)
        detail = self.client.get(f'/api/products/{self.product.pk}/').data
        self.assertEqual(detail['review_count'], 1)
        self.assertEqual(detail['rating_average'], 4)
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.patch(f'/api/reviews/{pk}/', {'body': 'Edited'}).status_code, 200)
        self.assertFalse(Review.objects.get(pk=pk).is_approved)

    def test_other_user_cannot_edit_or_delete_review_or_moderate(self):
        review = Review.objects.create(product=self.product, user=self.user, rating=4, title='Good', body='Good', is_approved=True)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.patch(f'/api/reviews/{review.pk}/', {'rating': 1}).status_code, 403)
        self.assertEqual(self.client.delete(f'/api/reviews/{review.pk}/').status_code, 403)
        self.assertEqual(self.client.patch(f'/api/admin/reviews/{review.pk}/', {'is_approved': True}).status_code, 403)

    def test_duplicate_and_invalid_ratings_are_rejected(self):
        self.assertEqual(self.post_review().status_code, 201)
        self.assertEqual(self.post_review().status_code, 400)
        for value in [0, 6, 'bad']:
            self.assertEqual(self.client.post('/api/reviews/', {'product': self.product.pk, 'rating': value, 'title': 'Test', 'body': 'Text'}).status_code, 400)

    def test_verified_purchase_is_derived_from_confirmed_orders(self):
        review = Review.objects.create(product=self.product, user=self.user, rating=4, title='Good', body='Good', is_approved=True)
        order = Order.objects.create(user=self.user, email=self.user.email, subtotal='10', total='10')
        OrderItem.objects.create(order=order, variant=self.variant, sku='cream', product_name='Cream', quantity=1, unit_price='10', line_total='10')
        self.assertFalse(self.client.get(f'/api/reviews/{review.pk}/').data['verified_purchase'])
        order.status = 'paid'
        order.save()
        self.assertTrue(self.client.get(f'/api/reviews/{review.pk}/').data['verified_purchase'])


    def test_review_ownership_flag_is_read_only_and_reveals_no_author_identity(self):
        self.client.force_authenticate(self.user)
        response = self.client.post('/api/reviews/', {'product': self.product.pk, 'rating': 4,
            'title': 'Good', 'body': 'Useful cream', 'is_owner': False})
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data['is_owner'])
        self.assertFalse({'user', 'email', 'author'} & set(response.data))
        Review.objects.filter(pk=response.data['id']).update(is_approved=True)
        self.client.force_authenticate(self.other)
        other = self.client.get(f"/api/reviews/{response.data['id']}/")
        self.assertFalse(other.data['is_owner'])
        self.client.force_authenticate(None)
        self.assertFalse(self.client.get(f"/api/reviews/{response.data['id']}/").data['is_owner'])

    def test_mine_filter_is_owner_scoped_and_requires_authentication(self):
        own = Review.objects.create(product=self.product, user=self.user, rating=4, title='Own', body='Pending')
        Review.objects.create(product=self.product, user=self.other, rating=5, title='Other', body='Public', is_approved=True)
        url = f'/api/reviews/?product={self.product.pk}&mine=true'
        self.assertEqual(self.client.get(url).status_code, 403)
        self.client.force_authenticate(self.user)
        response = self.client.get(url)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['id'], own.pk)
        self.assertTrue(response.data['results'][0]['is_owner'])
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.get(url).data['count'], 0)
        self.assertEqual(self.client.get('/api/reviews/?mine=invalid').status_code, 400)
