# Commerce feature APIs

These additions extend the existing backend. The frontend still needs screens and
API wiring. Amounts are decimal strings in the configured two-decimal currency.
Use PostgreSQL for production row locks. Local tests use SQLite and mocked providers.

## Promotions and vouchers

Staff configure `/api/admin/offers/` with products, brands and/or category IDs.
Category targeting includes descendant categories. A directly linked product's
`additional_value` overrides the default fixed/percentage value; manage these links
at `/api/admin/product-offers/` (`product`, `offer`, `additional_value`). Values are
nonnegative; percentages cannot exceed 100.

`buy_x_get_y` uses positive `buy_quantity` and `free_quantity`, with `value: "0"`.
Example: buy_quantity 2/free_quantity 1 makes every third unit of the same SKU free.
It does not combine different SKUs or add free gift products automatically.
The best SINGLE automatic offer is selected per SKU line; automatic offers do not
stack. Percentage/fixed unit prices round half-up before multiplication. For BOGO,
`line_total` is authoritative and may be less than `unit_price * quantity`.

Staff manage `/api/admin/vouchers/`: `code`, `kind` (`percentage` or `fixed`), `value`,
`min_subtotal`, `valid_from`, `valid_to`, `is_active`, optional `max_uses`.
Codes are case-insensitive/normalised uppercase. `used_count` is read-only.

- POST `/api/cart/voucher/` with `{ "code": "SAVE10" }` applies one voucher.
- DELETE the same endpoint removes it.
- Cart `total_price` is the merchandise subtotal AFTER automatic promotions but
  BEFORE a voucher. The additive `voucher` object reports validity/discount.
- Checkout recalculates everything under locks. Voucher discounts apply after
  automatic promotions. Free shipping threshold is evaluated after the voucher.
- Usage slots are reserved when hosted checkout is created. Provider failure rolls
  back a reservation; a terminal payment cancellation/expiry releases it once.
  Paid/refunded orders retain usage. Pending orders consume quota until resolved.
- Order `subtotal`, `discount_amount`, `shipping_cost`, `total` are snapshots.
  Products/cards still show base prices; clients must use quoted basket totals.

## Reviews and ratings

`/api/reviews/` supports public GET and authenticated POST. Fields: `product` ID,
`rating` (1–5), `title`, `body`. Filter GET with `?product=<id>`.
Only approved reviews are public; authors can also see their own pending reviews.
One review per account/product is allowed. Authors can PATCH/DELETE their own
reviews; editing resets moderation. Product changes and approval spoofing are denied.
Review bodies/titles are plain text; render them escaped in the frontend.

Staff moderate at `/api/admin/reviews/<id>/` with `{ "is_approved": true }` or delete
spam. Moderation cannot rewrite authors' ratings/text. `verified_purchase` is derived
from a confirmed paid/processing/shipped order; it is not client-editable. Product
list/detail JSON includes `rating_average` (null when none) and `review_count`,
both calculated from approved reviews only.

## Saved addresses

Authenticated CRUD: `/api/accounts/addresses/`. Fields: `label`, `full_name`, `line1`,
`line2`, `city`, `postcode`, two-letter `country`, optional `phone`, `is_default`.
Addresses are personal even for staff. Setting a default clears the previous default
under a per-user lock; a DB constraint enforces one default address.

Checkout can send `email`, `address_id`, `payment_method` instead of shipping fields.
Only an authenticated owner's address can be selected. Do not mix `address_id` and
explicit `shipping_*` fields. The order snapshots the address, so later edits or
address deletion never rewrite the order.

## Secure guest order access

Guest checkout returns a random `guest_access_token` alongside `payment_url`.
Store that capability securely; never log it or send it to third-party analytics.
Only a SHA-256 digest is saved. Tokens expire after seven days and are scoped to a
single guest order; they cannot unlock account-owned orders.

- POST `/api/orders/guest-status/` with `{ "order_number": "...", "token": "..." }`.
  The no-store response includes order/items, shipments, returns and refund statuses.
- POST `/api/orders/guest-access/` with order number and email requests a recovery
  link. The response is always generic 202; only matching guest orders receive mail.
  Links go to the trusted `FRONTEND_URL` at `/orders/access` with query parameters.
  The frontend must remove these parameters from history after reading them and POST
  the token in the request body. Use HTTPS in production. SMTP must be configured;
  the development console backend does not deliver real emails.
- Recovery requests are limited to 20/hour/IP; status lookups to 60/minute/IP. The
  default local-memory throttle cache is per-process; use a shared production cache
  and configure proxy identity handling before relying on distributed rate limits.

Authenticated customers can GET `/api/orders/` or `/api/orders/<order_number>/`.
Access is owner-scoped. Existing `/api/cart/orders/` remains supported.

## Shipment tracking

Staff GET/POST/PATCH `/api/admin/shipments/` with `order` ID, `carrier`,
`tracking_number`, optional HTTPS `tracking_url`, and `status`:
`label_created`, `in_transit`, `delivered`, `exception`.
Only paid orders can receive shipments. Status changes append immutable events;
delivery records `delivered_at`. An in-transit order cannot regress to processing
when another shipment label is created. Delivered shipments cannot move backwards.

Customers/guests see tracking/events through their authorised order response.
This is staff-maintained tracking. It does not book labels or poll carrier APIs.

## Returns

POST `/api/returns/` with `order_number`, `item_id` (from order items), `quantity`,
`reason`; guests additionally supply their access `token`. Account orders require
the owner. Authenticated GET/list/retrieve only returns the user's own records.

Only paid/processing/shipped orders qualify. The return window defaults to 30 days
(`RETURNS_WINDOW_DAYS`), measured from latest recorded delivery or order creation
when no delivery is recorded. Total non-rejected return quantities cannot exceed the
purchased quantity; order locks serialise concurrent requests.

Staff GET/PATCH `/api/admin/returns/<id>/` to approve/reject, with optional private
`staff_note`. After approval, POST `/receive/` with `{ "restock": false }` confirms
physical receipt. Restocking is explicit because cosmetics may be unsuitable for
resale. Repeated receipt calls never add inventory twice. Received returns can be
closed only after an associated successful refund exists. Refund amounts are chosen
by authorised staff, subject to the overall remaining-order cap; they are not
computed automatically from return quantity or voucher allocations.

## Refunds

Staff POST `/api/admin/refunds/` with:

```json
{
  "order_id": 1,
  "amount": "10.00",
  "reason": "Damaged product",
  "idempotency_key": "4ef3524e-3ddc-4d2c-b940-83088297e7a4",
  "return_id": 1
}
```

`return_id` is optional and must refer to an approved/received return on that order.
A UUID key is mandatory; retry the SAME key with the SAME order/amount/return.
Funds are reserved under an order lock before calling a provider. Pending/manual/
successful requests count against the cap; failed requests release capacity.
Duplicate requests cannot refund twice. Customers cannot call these endpoints.
GET/list/retrieve and POST `/api/admin/refunds/<id>/retry/` are supported. Status,
provider references and refunded totals cannot be patched by clients.

Stripe card/bank refunds use the original payment intent and existing
`STRIPE_SECRET_KEY`. Older paid orders can resolve the intent from their verified
Checkout Session. A successful verified provider response or signed webhook updates
`refunded_amount`; a full refund sets order status `refunded`. Refunds do NOT restock
inventory; the separate inspected-return receipt handles that.

Subscribe the existing Stripe webhook to `refund.created`, `refund.updated` and
`refund.failed`. Webhooks validate reference, amount, currency and payment intent.
Missing keys, outages and ambiguous timeouts leave requests pending/reserved; retry
the same key after resolving the prerequisite. Never issue a fresh refund key just
to work around an unknown provider outcome. Provider/dashboard reconciliation remains
necessary for orphan sessions and refunds initiated outside this API.

Crypto refunds are recorded as `requires_manual`: no wallet transfer is attempted
and they are NEVER marked successful automatically. The Coinbase charges adapter
has no verified automatic refund implementation. These records reserve the amount
for external handling; reconciliation/completion needs a provider-specific extension.
No live payment/refund has been validated in this environment.

## Search discovery

GET `/api/search/?q=night+cream` now uses relevance by default: exact name, name
prefix, name terms, brand terms, then other matches. Existing explicit price/name/
newest sorts still override relevance. `ordering=relevance` is supported.

If there are no literal matches within the selected filters, a bounded catalogue
vocabulary can correct misspelled words and retry. The response exposes original
`query`, `corrected_query` and `correction_applied`; use `typo_correction=false` to
require literal matching. Corrections consider at most 1,000 visible products and
are not a semantic or multilingual search engine. Hidden products/brands do not
contribute. Synonyms are not configured.

GET `/api/search/suggestions/?q=night&limit=8` returns product/brand suggestions
(`type`, `label`, `slug`). Limit is 1–10; only visible catalogue records contribute.
The frontend still needs the search box, suggestions UI and correction display.

## Validation and deployment

From `/workspace/lookfantastic/backend`:

```sh
/workspace/payment-venv/bin/python manage.py migrate --noinput
/workspace/payment-venv/bin/python manage.py test accounts products cart blog subscriptions search fulfillment --noinput
/workspace/payment-venv/bin/python manage.py check
/workspace/payment-venv/bin/python manage.py makemigrations --check --dry-run
```

New migrations create addresses, reviews, voucher/order-access data and fulfillment
records. Existing orders retain zero discounts/refunds by default; no historic
payments are inferred. Automatic recurring subscriptions, live provider credentials,
production configuration and frontend integration remain separate work.
