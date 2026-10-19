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

## Conditional Google login

Google login stays disabled unless `GOOGLE_OAUTH_CLIENT_ID`,
`GOOGLE_OAUTH_CLIENT_SECRET` and a valid `GOOGLE_OAUTH_REDIRECT_URI` are present.
Use Google Cloud's **web application OAuth client**, not service-account credentials.
The redirect must be HTTPS (HTTP is allowed only for localhost/127.0.0.1 development).
Register that exact URI in Google Cloud Console, configure the consent screen/test
users as required, and inject the client secret securely. Changes require an app restart.

Frontend wiring (not included in this backend change):

1. GET `/api/accounts/auth/providers/`; show Google login only if `google.enabled`.
2. GET `/api/accounts/google/start/` with browser credentials, then navigate to
   `authorization_url`. This sets a session-bound state, nonce and PKCE verifier.
3. At the configured frontend callback, handle provider cancellation/error; otherwise
   POST `{code, state}` to `/api/accounts/google/` with the same browser's session
   cookies. Use `credentials: 'include'` (Axios: `withCredentials: true`) on both calls.
   Remove OAuth query parameters from browser history after handling the response.
4. On success, use the returned access JWT and HttpOnly refresh cookie exactly as
   for password login. A missing configuration returns 503; invalid or expired
   attempts return 400 and must restart the flow. Attempts expire after ten minutes.

For cross-site deployments configure allowed frontend origins, secure cookies and
appropriate session SameSite settings; do not weaken OAuth state verification.
Signature, issuer, audience, expiry, nonce and verified-email checks are mandatory.
Accounts are identified by Google's subject ID. Existing password accounts are not
automatically linked by email. Explicit authenticated account linking is not implemented.
Restricted accounts cannot use Google login. No Google tokens are stored.

Allow outbound HTTPS to `oauth2.googleapis.com` (code exchange) and
`www.googleapis.com` (Google signing certificates). `accounts.google.com` is the
browser authorization destination. Local tests mock Google exchange; additional RSA
fixtures exercise real signature/audience/issuer/expiry rejection. Live OAuth remains
unverified until real web-client credentials and a frontend callback are configured.

## Product catalogue checks

Run `python manage.py test products accounts cart` from `backend`. Product checks
cover public catalogue/detail pages, exact slug lookup, category paths, brand/search
filters, price ranges/sorting, pagination/facets, active variants, offers, confirmed
sales ranking, staff permissions and category moves.

Public product visibility requires an active product and brand, plus an active
category ancestry (uncategorised active products remain visible). Category and brand
product endpoints now use the same validated filters and paginated response with
facets as `/api/products/`. Price ranges require one active SKU satisfying both
bounds; sorting by `price` uses the cheapest active SKU and never duplicates products.
`ordering=-created_at` remains supported alongside `newest`, `price` and `name` aliases.
Bestsellers now come from paid/processing/shipped order quantities and are empty when
no confirmed sales exist. Pending/cancelled orders do not contribute.

Admin category PATCH preserves the parent unless `parent_id` is explicitly supplied;
null promotes a node to root. Self/descendant parenting is rejected. Negative SKU
prices, reference prices below selling prices, invalid offer dates and percentages
outside 0–100 are rejected. Existing records are not rewritten by these checks.

Discount support remains limited to directly assigned percentage/fixed product
offers. Category/brand offer targeting and per-product override values are not
implemented in basket pricing; buy-X-get-Y configuration is explicitly rejected by
the product management API until its pricing rules are implemented. These limitations
must be addressed before using those promotion types commercially.

## Blog checks

Run `python manage.py test blog products accounts cart` from `backend`. Blog checks
cover publication timing, drafts/schedules, exact slug lookup, search, categories,
pagination, related-product visibility, HTML sanitisation and staff CRUD permissions.
Publication time is evaluated on every request, so scheduled posts appear without
restarting the server. Articles in inactive editorial categories are hidden; articles
without categories remain eligible. Publishing through the admin API assigns the
current time if no publication time exists; explicit future schedules are preserved.
New articles default to the authenticated editor as author.

Canonical management URLs remain `/api/blog/admin/articles/` and
`/api/blog/admin/categories/`. The supplied frontend's `/api/admin/articles/` is now
a supported compatibility endpoint; it accepts `category_id` and returns the nested
`category` object its editor expects. The canonical endpoint continues returning a
numeric category ID. Both accept optional `related_products` IDs. Conflicting
`category`/`category_id` input is rejected. `/api/admin/article-categories/` is the
compatibility category endpoint, avoiding the existing product-category routes.

Article body HTML is allowlisted on API writes and public reads (including legacy
records). Scripts, event handlers, unsafe URL schemes and embedded active content
are removed. Safe editorial formatting and links are retained. Existing stored
records are not bulk-modified. Bodies are HTML; Markdown conversion is not provided.
Related products use the same visibility rules as the public catalogue.

Frontend work remains: the uploaded public blog listing renders empty links and needs
article cards. That frontend source is not modified by these backend checks.
