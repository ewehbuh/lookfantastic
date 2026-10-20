# Frontend

Next.js App Router, React, TypeScript, Tailwind CSS v4, next-intl and Redux Toolkit.
The original uploaded source is now organized by feature with a reproducible,
locked dependency setup. Existing route URLs are preserved.

## Run locally

Requires Node.js 20.9+ (validated with Node 24).

```sh
cd frontend
npm ci
# Optional: copy .env.example to .env.local and adjust the API URLs.
npm run dev
```

Run Django on port 8000 in another terminal. `NEXT_PUBLIC_API_URL` is used in the
browser; `API_URL` optionally overrides the backend address for public server
rendering. The backend must allow the frontend's origin and credentialed requests.
Do not put secrets in variables prefixed with `NEXT_PUBLIC_`.

```sh
npm test
npm run test:watch
npm run typecheck
npm run build
npm run start
npm run lint
```

The production build and TypeScript checks pass. ESLint currently reports inherited
issues in the uploaded feature implementations, primarily explicit `any` API types
and effect patterns; it is not a clean lint baseline. Rules remain enabled so that
these issues remain visible. Existing API flows need individual integration audits;
a successful build does not establish complete backend compatibility.

## Structure

```text
frontend/
  messages/                  # Locale dictionaries (en/fr placeholders)
  src/
    app/[locale]/            # Route entry points and layouts only
      (storefront)/          # Header, navigation, footer and basket drawer
        (auth)/              # Login, registration and password reset
        account/             # Customer routes and their access guard
        product/, category/, cart/, checkout/, blog/, subscriptions/
      admin/                 # Staff layout and routes; no storefront chrome
    features/
      account/               # Customer profile, wishlist and points screens
      admin/                 # Staff screens and administration controls
      auth/                  # Authentication screens, guards and state
      blog/                  # Editorial screens
      cart/                  # Basket screen, drawer and state
      catalogue/             # Product/category screens and product components
      checkout/              # Checkout and payment-return screens
      home/                  # Homepage screen and public catalogue API service
      subscriptions/         # Subscription screens
    components/
      layout/                # Shared storefront shell
      ui/                    # Domain-independent visual primitives
    i18n/                    # Locale routing, navigation and request configuration
    lib/
      api/client.ts          # Browser-only authenticated/credentialed API client
      api/server.ts          # Server-only public API client; no customer tokens
      utils.ts               # Shared formatting helpers
    providers/               # Application providers and startup hooks
    store/                   # Store factory and typed Redux hooks
    styles/                  # Global styles and semantic colour tokens
  next.config.ts
  postcss.config.mjs
  tsconfig.json
  eslint.config.mjs
  package.json
  package-lock.json
```

### Placement and dependency rules

- Keep `page.tsx` thin: it delegates to a feature screen. Keep Next.js route metadata,
  route handlers and segment configuration in `app/` when they are added.
- Put feature components, state, API services and types alongside their feature.
  Create `api/`, `types/` or `hooks/` only when they have real implementations.
- Reusable UI primitives must not depend on feature code. Feature code must not
  import route modules from `app/`. Use direct imports rather than broad barrels
  that accidentally pull browser dependencies into server rendering.
- Use `@/` imports for shared or cross-feature dependencies. Local imports are fine
  within one folder. The Redux store factory composes feature reducers; providers
  own a store instance rather than sharing customer state across server requests.
- Server components use `lib/api/server`; client components use `lib/api/client`.
  `server-only`/`client-only` markers enforce these boundaries during builds. Browser
  session restoration occurs after hydration, before access guards redirect.
- Internal links and client routing use `i18n/navigation` to retain the locale.
  Locale dictionaries are intentionally empty until screen translation work begins;
  selecting French does not yet translate the existing English copy.
- Staff guards control frontend navigation; Django remains the authorization boundary.
- Add reusable colours to `styles/globals.css`. The neutral palette is provisional:
  access to the requested reference site was blocked, so colours were not sampled.

The compatible `@swc/core` version is pinned through `overrides` because the newer
native package could not initialize its cache under this cloud filesystem's ownership
rules. Package integrity and TLS checks remain enabled. Revisit this pin when updating
Next.js/next-intl dependencies in a compatible environment.

## Next implementation work

Audit feature API contracts, replace inherited untyped data with feature-owned types,
and resolve lint findings before expanding functionality. Existing checkout screens
still need the hosted-payment and currency integrations, and subscription purchase
must remain unavailable until real recurring billing is implemented. The payment
return page is explicitly pending; browser redirects do not prove payment success.


## Automated tests

Vitest and React Testing Library run browser-component and state/API tests in jsdom.
Run `npm test` for one complete run or `npm run test:watch` during development.
`npm run check` runs tests, TypeScript and the production build in sequence, stopping
on failure. The GitHub Actions frontend workflow runs this check for frontend changes
on pull requests and pushes to master. Its first hosted run must be checked on GitHub;
local success does not establish a successful hosted workflow run.

Keep tests beside their feature in `__tests__/` or use `*.test.ts(x)` filenames.
Shared setup lives in `tests/setup.ts`; the runner is configured in
`vitest.config.mts`. Session storage and rendered components are reset between tests.

The initial suite covers permission guards during session restoration, customer/staff
access, login/session rejection, independent Redux stores, basket discounts and API
operations, response immutability, cookie/bearer handling and invalid price display.
API responses and navigation are mocked; these are not live payment tests or full
browser end-to-end tests. Client/server module boundaries are separately checked by
the Next.js production build. Existing lint debt remains outside the passing `check`
command and is still visible through `npm run lint`.


## Catalogue integration

Homepage, category and product screens now use the typed backend contract in
`features/catalogue/types/catalogue.ts` and services in `features/catalogue/api/`.
`/products` is the general browsing route; featured brand links apply its `brand`
filter. Category paths, multiple brands, prices, offers, sorting and pagination are
passed to Django. Pagination retains filters and uses local URLs, never the backend
host returned in `next`/`previous`. Filter submission resets the page.

Empty results and API failures have separate displays. Only missing product records
produce product-not-found; failed detail requests reach a retry boundary. Product
controls select an available SKU, cap quantity at its stock, and show add-to-basket
success/failure. Basket eligibility/prices remain authoritative on Django. Product
text is escaped instead of injecting description HTML; rich-text formatting can be
added later with an explicit sanitization policy. Review summaries and applicable
offer names are displayed; review submission is a later phase.

Catalogue tests cover API contracts, exact slug resolution, homepage empty responses,
filter/pagination state, empty/error screens, stock controls and basket failures.
The running development database was empty during live smoke verification; product
detail purchase behaviour is covered with mocked backend responses. Product prices now use the currency-selector integration below; backend price
filters remain in the catalogue base currency and are labelled accordingly.


## Basket, vouchers and currency

The header loads `/api/currencies/`, offers only currencies with current backend
rates and restores a valid local preference. If a saved currency is no longer
available it falls back to the backend base. Manual choices are remembered in
localStorage when available. There is no location-based selection yet.

Product prices and drawer subtotals are indicative conversions; unavailable rates
show a placeholder rather than inventing a conversion. Basket item totals, voucher
discounts, shipping and totals come from `/api/cart/quote/`. Cart changes and
currency changes invalidate quotes, and responses from invalidated/older quote
requests are ignored. Checkout is unavailable without a matching quote. Base price
filters remain in the backend base currency. Automatic product promotions already
included in line totals are not recalculated in the browser.

Basket state retains backend voucher validity, promotion savings and guest-merge
warnings. Voucher apply/remove calls the backend and displays validation failures.
Quantity changes respect displayed stock and errors preserve the existing basket.
The basket waits for session restoration before fetching to avoid loading a guest
basket while a signed-in identity is being restored. Drawer totals are explicitly
indicative; the full basket confirms vouchers/shipping before proceeding.

The existing checkout now sends the quoted currency and shows the final returned
order total before a customer follows the hosted HTTPS payment link. Guest order
capabilities are kept in sessionStorage when available, never in URLs. A browser
redirect is not payment confirmation. Direct checkout reloads return customers to
the basket for a fresh quote. This is the minimum currency-safe handoff: payment
method selection (currently default Stripe), saved addresses, token recovery UI and
backend-verified payment/order status screens remain for the checkout phase. No live
charges were made during verification.


Live read-only checks for currencies, guest basket and GBP quote passed against a
new process running the latest backend on port 8001. An older process on port 8000
returned 404 for currencies; restart that process from the current backend checkout
before using the frontend's default API URL. Currency tests use mocked non-GBP rates;
actual foreign-currency availability still depends on current backend exchange rates.
