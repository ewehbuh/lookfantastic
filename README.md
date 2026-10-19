# Lookfantastic backend

Django backend imported from the supplied source archive, with Stripe hosted checkout
and Coinbase Commerce hosted crypto charges. No production credentials are included.
The supplied database, media, caches and original development secret are excluded.

## Development

Use the existing checkout; cloud tasks are already isolated and need no worktree.

```sh
cd /workspace/lookfantastic/backend
python -m venv /workspace/lookfantastic/.venv
/workspace/lookfantastic/.venv/bin/pip install -r requirements.txt
/workspace/lookfantastic/.venv/bin/python manage.py migrate
/workspace/lookfantastic/.venv/bin/python manage.py test cart
/workspace/lookfantastic/.venv/bin/python manage.py runserver 0.0.0.0:8000
```

Export configuration from `.env.example` through your deployment's secure configuration.
The application does not automatically load `.env`. Never commit secret values.
Original development settings are not production deployment settings: configure hosts,
DEBUG, TLS, cookies and a strong Django secret before deployment. Use PostgreSQL for
production checkout row locks; SQLite is for local development only.

## Enable payments

No payment keys were available when this integration was prepared. No live charge
or external provider call has been tested. Provider API access/account availability
must be verified with your account before release. Use test credentials first.

- Stripe: supply `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.
  Register HTTPS `/api/payments/stripe/webhook/` and subscribe to
  `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
  `checkout.session.async_payment_failed`, `checkout.session.expired`.
- Bank: enable eligible bank debit methods in Stripe Dashboard, then set
  `STRIPE_BANK_PAYMENT_METHOD_TYPES` to a comma-separated list supported by the
  account and selected currency. This uses Stripe bank debits, not manual transfers.
  Bank checkout remains disabled until this list is configured. Availability of a
  specific method still depends on Stripe eligibility.
- Crypto: supply `COINBASE_COMMERCE_API_KEY` and
  `COINBASE_COMMERCE_WEBHOOK_SECRET`. Register HTTPS
  `/api/payments/crypto/webhook/` for `charge:confirmed` and `charge:failed`.
  This adapter uses Coinbase Commerce's charges API; confirm that your merchant
  account supports that API before enabling it.
- Signing secrets must be actual runtime values for local signature verification;
  outbound proxy placeholders cannot replace them. Enter them through your
  deployment secret manager, never chat. API keys can use supported outbound proxy bindings.
- Set `PAYMENT_FRONTEND_URL` to the trusted storefront origin. It is never accepted
  from shopper input. Set `PAYMENT_CURRENCY` to a two-decimal currency supported by
  the provider (the product prices and shipping thresholds must be denominated in
  that currency; this integration does not convert currency).

## Frontend integration

The uploaded frontend is not a complete buildable project and is not included here.
It must be updated before customers can use these flows:

1. GET `/api/payments/methods/`; show only configured methods.
2. POST `/api/cart/checkout/` with existing shipping fields and
   `payment_method`: `stripe`, `bank` or `crypto`.
3. Redirect the browser to the returned `payment_url`. Do not immediately report
   success as the old frontend does. Orders start pending; payment is confirmed
   only by a verified webhook with matching reference, amount and currency.
4. Display confirmed order status from an authorised order-history response
   (`GET /api/cart/orders/` for authenticated users). The return URL itself is
   never proof of payment. Guest order-status retrieval is not implemented.

The backend calculates prices and shipping. It reserves stock and clears the basket
when a hosted checkout is created. Failed or expired provider events restore stock
once. Configure reliable public webhook delivery, monitor pending orders and reconcile
provider outages/late payments. Do not fulfil pending orders. Cancel return navigation
alone does not release the reservation; a terminal provider event is required.
Provider calls occur inside the checkout transaction; reconcile provider-created
sessions if an ambiguous timeout or database commit failure leaves an orphan session.

Existing recurring subscription charges were simulations. New subscription creation
now returns 503 and the mock billing task does not record paid orders. Real recurring
billing is a separate integration; existing subscriptions are not migrated.

## Tests

`python manage.py test cart` covers server totals, credentials, rollback, stock,
bank method selection, crypto charge creation, invalid signatures, payment amount/
currency/reference matching, delayed Stripe settlement and duplicate stock release.
Provider calls are mocked; successful tests do not establish live payment readiness.

## Accounts

Run `python manage.py test accounts cart` from `backend` for account regression
checks plus the payment regression suite. Run `python manage.py migrate` before
startup; token blacklist migrations are now required.

- Login returns an access JWT and an HttpOnly refresh cookie. Browser clients must
  send credentials when using `/api/accounts/token/refresh/` and `/api/accounts/logout/`.
  Refresh tokens rotate and are blacklisted after use/logout. Already issued access
  tokens remain valid until expiry unless the account is deactivated or restricted.
- Existing JWTs, refreshes and sessions reject banned/login-disabled accounts.
- Password recovery uses `/api/accounts/password-reset/` (email), followed by
  `/api/accounts/password-reset/confirm/` (`uid`, `token`, `new_password1`,
  `new_password2`). Configure `FRONTEND_URL` for emailed frontend links. The frontend
  reset page must read both query parameters and submit those fields. Delivery uses
  the console email backend until SMTP is separately configured.
- Email verification uses POST `/api/accounts/verify-email/` (`key`), or the emailed
  confirmation page. Email verification remains optional, as in the supplied settings.
- Wishlist and points lists remain paginated (`results`). Wishlist entries now embed
  product data; create entries with `product_id`. Frontend list pages must consume
  `results` rather than treating the entire response as an array.
- Shopping wishlists/points feeds are personal, including staff accounts. Staff may
  explicitly inspect a customer's balance with `?user_id=`. Only superusers may
  change roles or modify existing staff/superuser accounts through the management API.
