# Admin release — 2026-10-11

Selective promotion from dev `d0b2311` onto master `2ce60b8`.

- New admin dashboard, scoped light theme, grouped desktop navigation and mobile navigation.
- Responsive product card grid, drag handles, visibility controls and mutation error feedback.
- Updated hits administration: sales suggestions for the last 30 days, pinned and excluded products, configurable count. Uses existing orders and app_settings tables.
- Build version details available from the environment badge.
- Existing production kitchen pages, product editor, checkout, kiosk and order board retained.

Excluded: inventory routes, APIs and product accounting/recipe integrations; combos; all migration changes; deployment workflows and dependency changes. No migrations, seeds or database writes were performed during verification.

Validation:

- `npm run build` passed with the existing master lockfile (Next.js 16.3.0).
- `node --import tsx --test scripts/test-admin-dashboard.mts`: 5 passed.
- Targeted ESLint: no errors; existing image-element warning in the transferred hits screen.
- Production browser checks at 390px and 1440px: dashboard, products and hits; no horizontal overflow or JavaScript exceptions; mobile navigation opens/closes; kitchen links retained; inventory and combo links absent. Uses intercepted fixture API responses without writes.
- Anonymous version and hits admin API requests return 403.
- Read-only hits query succeeded against the configured existing database.
- Screenshots and browser verification script retained locally in ignored `output/kitchen-qa/`.
