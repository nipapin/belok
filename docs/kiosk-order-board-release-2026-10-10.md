# Kiosk / order-board release — 10 October 2026

Target: `master` (the production branch; no `main` branch exists).

## Included

- PIN-protected order board at `/order-board` and `orders.belok.pro`, per-item preparation, automatic Ready, bulk completion, sound interval and light theme.
- Dispatch of ready orders regardless of payment status.
- Kiosk catalogue polling, automatic product dialog, current price and availability.
- Cash/card/SBP choices, aQsi card payment, fiscal receipts, cash-order forwarding and aQsi settings/history.
- Product-option calculation and UI dependencies required by the kiosk. Existing production checkout, pickupTime and T-Bank CA configuration are preserved.

Combo, inventory, AI search, dev deployment workflows and admin redesign are excluded.

## Database prerequisite

Before production deployment, verify these migrations in the production `belok` database's `_migrations` table:

1. `019_product_options.sql`
2. `020_aqsi.sql`
3. `021_aqsi_request_time.sql`
4. `022_aqsi_cash_orders.sql`
5. `023_order_board_item_progress.sql`

Apply missing migrations through the existing manual migration procedure after checking current schema/history and making a backup. `023` is not repeatable outside the migration runner: it adds a column and constraint without `IF NOT EXISTS`. Migrations add fields/tables, update missing ingredient-name snapshots and create catalogue tracking triggers; they do not delete products or orders. New kiosk and board APIs require this schema.

This release does not copy data, settings or `.env` from `belok_dev`; it does not automatically execute migrations. Keep the production DATABASE_URL pointed at `belok`.

## Terminal configuration

For aQsi, use production AQSI_API_KEY / AQSI_DEVICE_ID and saved production fiscal settings. Enable AQSI_WORKER_ENABLED=true (or run the separate aqsi:worker process) for continued queue polling. Dev database settings are not promoted.

## Validation

- Production build and TypeScript: passed.
- aQsi receipt/payment-result tests: 6 passed.
- Product-option pricing tests: 6 passed.
- Browser UI checks could not run: this workspace blocks the Unix sockets Chrome needs to start. Browser tests remain available in scripts/. No real terminal or production database was contacted.
- Database/queue integration checks require a dedicated PostgreSQL test database and have not been executed in this workspace.
