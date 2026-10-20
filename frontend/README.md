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
