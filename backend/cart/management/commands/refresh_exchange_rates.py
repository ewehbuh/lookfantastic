from django.core.management.base import BaseCommand, CommandError
from cart.exchange_rates import refresh_exchange_rates, RateRefreshError


class Command(BaseCommand):
    help = 'Refresh supported currencies from the Frankfurter daily reference-rate feed.'

    def handle(self, *args, **options):
        try:
            count = refresh_exchange_rates()
        except RateRefreshError as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(self.style.SUCCESS(f'Refreshed {count} exchange rates.'))
