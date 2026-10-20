from decimal import Decimal
from io import StringIO
from unittest.mock import patch, Mock
import requests
from django.core.management import call_command, CommandError
from django.test import TestCase, override_settings
from django.utils import timezone
from .currency import SUPPORTED
from .models import ExchangeRate
from .exchange_rates import refresh_exchange_rates, RateRefreshError


@override_settings(PAYMENT_CURRENCY='gbp', FX_MAX_AGE_SECONDS=345600)
class RateRefreshTests(TestCase):
    def payload(self):
        return dict(base='GBP', amount=1, date=timezone.now().date().isoformat(),
                    rates={c.upper(): '1.25' for c in SUPPORTED if c != 'gbp'})

    @patch('cart.exchange_rates.requests.get')
    def test_success_and_repeat_refresh(self, get):
        get.return_value = Mock(status_code=200)
        get.return_value.json.return_value = self.payload()
        self.assertEqual(refresh_exchange_rates(), len(SUPPORTED)-1)
        refresh_exchange_rates()
        self.assertEqual(ExchangeRate.objects.count(), len(SUPPORTED)-1)
        self.assertEqual(ExchangeRate.objects.get(currency='usd').rate, Decimal('1.25'))
        args = get.call_args
        self.assertTrue(args.args[0].startswith('https://'))
        self.assertFalse(args.kwargs['allow_redirects'])
        self.assertEqual(args.kwargs['timeout'], (5, 20))

    @patch('cart.exchange_rates.requests.get')
    def test_invalid_payloads_do_not_partially_save(self, get):
        old = timezone.now()-timezone.timedelta(days=1)
        row = ExchangeRate.objects.create(base_currency='gbp', currency='usd', rate='1.5', as_of=old)
        get.return_value = Mock(status_code=200)
        cases = [None, {}, {**self.payload(), 'base':'EUR'}, {**self.payload(), 'amount':2},
                 {**self.payload(), 'date':(timezone.now()+timezone.timedelta(days=1)).date().isoformat()},
                 {**self.payload(), 'date':(timezone.now()-timezone.timedelta(days=5)).date().isoformat()},
                 {**self.payload(), 'rates':{'USD':'1.2'}}]
        for invalid in ['NaN', 'Infinity', '-1', '0', '10000000000', '0.00000000001', 'oops']:
            payload = self.payload()
            payload['rates']['USD'] = invalid
            cases.append(payload)
        for payload in cases:
            with self.subTest(payload=payload):
                get.return_value.json.return_value = payload
                with self.assertRaises(RateRefreshError):
                    refresh_exchange_rates()
                row.refresh_from_db()
                self.assertEqual(row.rate, Decimal('1.5'))
                self.assertEqual(row.as_of, old)
                self.assertEqual(ExchangeRate.objects.count(), 1)

    @patch('cart.exchange_rates.requests.get')
    def test_newer_staff_rate_is_preserved(self, get):
        row = ExchangeRate.objects.create(base_currency='gbp', currency='usd', rate='1.7', as_of=timezone.now())
        get.return_value = Mock(status_code=200)
        get.return_value.json.return_value = self.payload()
        refresh_exchange_rates()
        row.refresh_from_db()
        self.assertEqual(row.rate, Decimal('1.7'))

    @patch('cart.exchange_rates.requests.get')
    def test_network_http_and_parse_errors_fail_command(self, get):
        get.side_effect = requests.Timeout()
        with self.assertRaises(CommandError):
            call_command('refresh_exchange_rates', stdout=StringIO())
        get.side_effect = None
        get.return_value = Mock(status_code=302)
        with self.assertRaises(RateRefreshError):
            refresh_exchange_rates()
        get.return_value.status_code = 200
        get.return_value.json.side_effect = ValueError('invalid json')
        with self.assertRaises(RateRefreshError):
            refresh_exchange_rates()
        self.assertFalse(ExchangeRate.objects.exists())
