"""Import reference rates from Frankfurter's institutional-source daily feed."""
from datetime import date, datetime, time, timezone as dt_timezone
from decimal import Decimal, InvalidOperation
import requests
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from .currency import SUPPORTED, currency_code
from .models import ExchangeRate


class RateRefreshError(Exception):
    pass


def refresh_exchange_rates():
    base = currency_code(settings.PAYMENT_CURRENCY)
    targets = sorted(set(SUPPORTED) - {base})
    try:
        response = requests.get('https://api.frankfurter.dev/v1/latest',
            params={'base': base.upper(), 'symbols': ','.join(c.upper() for c in targets)},
            timeout=(5, 20), allow_redirects=False)
        if response.status_code != 200:
            raise RateRefreshError('Exchange-rate provider returned an unsuccessful status.')
        payload = response.json(parse_float=Decimal)
        if not isinstance(payload, dict) or payload.get('base') != base.upper() or Decimal(str(payload.get('amount'))) != 1:
            raise RateRefreshError('Unexpected exchange-rate base or amount.')
        published = date.fromisoformat(payload['date'])
        as_of = datetime.combine(published, time.min, tzinfo=dt_timezone.utc)
        now = timezone.now()
        if published > now.date() or (now-as_of).total_seconds() > settings.FX_MAX_AGE_SECONDS:
            raise RateRefreshError('Exchange-rate provider data is stale or future-dated.')
        rates = payload['rates']
        if not isinstance(rates, dict) or set(rates) != {c.upper() for c in targets}:
            raise RateRefreshError('Exchange-rate provider did not return every requested currency.')
        validated = {}
        for code in targets:
            rate = Decimal(str(rates[code.upper()]))
            if not rate.is_finite() or rate <= 0 or rate >= Decimal('10000000000'):
                raise RateRefreshError('Exchange-rate provider returned an invalid rate.')
            rate = rate.quantize(Decimal('.0000000001'))
            if rate <= 0:
                raise RateRefreshError('Exchange rate is below supported precision.')
            validated[code] = rate
    except (requests.RequestException, ValueError, TypeError, KeyError, InvalidOperation) as exc:
        raise RateRefreshError('Unable to obtain valid exchange rates; existing rates retained.') from exc
    updated = 0
    # All validation precedes writes. Never replace a newer staff/provider rate.
    with transaction.atomic():
        for code, rate in validated.items():
            row, created = ExchangeRate.objects.get_or_create(base_currency=base, currency=code,
                defaults={'rate': rate, 'as_of': as_of})
            if created:
                updated += 1
            else:
                updated += ExchangeRate.objects.filter(pk=row.pk, as_of__lte=as_of).update(rate=rate, as_of=as_of)
    return updated
