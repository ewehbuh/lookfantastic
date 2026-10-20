# Frontend source

Imported from the user's uploaded `src.zip`. This is a source-only Next.js/React
frontend: the upload did not include package.json, a lockfile, TypeScript/Next
configuration or locale messages outside src. It is not yet a buildable application.
Backend API compatibility and checkout integration also require a separate audit.

The shared Tailwind v4 theme in `src/styles/globals.css` defines the neutral colour
palette. Header, promotional strip, footer, product badges and existing primary
actions use those tokens. Error/success colours retain their semantic meaning.

The requested reference is https://www.lookfantastic.com/. Direct access returned
proxy HTTP 403 during this change, so these colours are provisional, not sampled
or verified against the live site. Exact matching requires accessible reference
styles or a screenshot. No visual/build validation has been performed because the
uploaded build configuration is missing.
