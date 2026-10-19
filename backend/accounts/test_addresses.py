from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from .models import Address
from cart.serializers import CheckoutSerializer


class AddressTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(email='one@example.com')
        self.other = get_user_model().objects.create_user(email='two@example.com')
        self.payload = {'full_name': 'One Shopper', 'line1': '1 Road', 'city': 'London', 'postcode': 'ABC', 'country': 'gb'}

    def test_addresses_are_private_and_require_authentication(self):
        self.assertEqual(self.client.get('/api/accounts/addresses/').status_code, 401)
        address = Address.objects.create(user=self.other, **self.payload)
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.get('/api/accounts/addresses/').data['count'], 0)
        self.assertEqual(self.client.patch(f'/api/accounts/addresses/{address.pk}/', {'city': 'Wrong'}).status_code, 404)
        self.assertEqual(self.client.delete(f'/api/accounts/addresses/{address.pk}/').status_code, 404)

    def test_crud_and_one_default_per_user(self):
        self.client.force_authenticate(self.user)
        first = self.client.post('/api/accounts/addresses/', {**self.payload, 'is_default': True})
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(first.data['country'], 'GB')
        second = self.client.post('/api/accounts/addresses/', {**self.payload, 'is_default': True})
        self.assertEqual(second.status_code, 201)
        self.assertEqual(Address.objects.filter(user=self.user, is_default=True).count(), 1)
        self.assertFalse(Address.objects.get(pk=first.data['id']).is_default)
        self.assertEqual(self.client.delete(f"/api/accounts/addresses/{first.data['id']}/").status_code, 204)

    def test_checkout_resolves_owned_address_to_snapshot_and_rejects_foreign(self):
        owned = Address.objects.create(user=self.user, **self.payload)
        foreign = Address.objects.create(user=self.other, **self.payload)
        from rest_framework.test import APIRequestFactory, force_authenticate
        from rest_framework.request import Request
        raw = APIRequestFactory().post('/')
        force_authenticate(raw, self.user)
        request = Request(raw)
        payload = CheckoutSerializer(data={'email': self.user.email, 'address_id': owned.pk}, context={'request': request})
        self.assertTrue(payload.is_valid(), payload.errors)
        self.assertEqual(payload.validated_data['shipping_name'], 'One Shopper')
        owned.line1 = 'Changed'
        owned.save()
        self.assertEqual(payload.validated_data['shipping_address'], '1 Road')
        bad = CheckoutSerializer(data={'email': self.user.email, 'address_id': foreign.pk}, context={'request': request})
        self.assertFalse(bad.is_valid())
