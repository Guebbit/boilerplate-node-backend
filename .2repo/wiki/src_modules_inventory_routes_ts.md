# src/modules/inventory/routes.ts

## Purpose

Defines the Express route table for all staff-facing inventory endpoints. Every route in this module sits behind an admin-only auth gate because the customer-facing half of inventory (how much stock a shopper can buy) is intentionally not exposed as a route at all — it is surfaced as an `available` field on the product object.

## Key elements

- **`router`** (exported) — the Express `Router` instance that the inventory module mounts. All five routes are registered on it.
- **`router.use(getAuth, isAuth, isAdmin)`** — a single middleware chain applied before any route, so every endpoint requires a valid, authenticated, admin user.
- **`GET /inventory/levels`** → `getInventoryLevels` — returns stock levels, scarcest first.
- **`GET /inventory/movements`** → `getStockMovements` — returns the stock movement ledger, newest first.
- **`POST /inventory/receipts`** → `postReceipt` — records a supplier delivery.
- **`POST /inventory/adjustments`** → `postAdjustment` — records a signed stocktake correction.
- **`POST /inventory/reservations/sweep`** → `postReservationsSweep` — expires stale reservations; triggered manually by an operator rather than a cron job.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — source of `getAuth`, `isAuth`, `isAdmin`; imported and chained via `router.use` to gate every route.
- **`src/modules/inventory/controllers/*.ts`** (five controllers) — each contributes its handler function to one of the routes listed above.
- **`src/modules/inventory/module.ts`** — consumes the exported `router` to register the inventory endpoints with the application.
- **`src/modules/inventory/tests/unit/routes.test.ts`** — unit-tests the route definitions in this file.
- **`tests/cross-cutting/authenticated-controllers.test.ts`** — verifies that controllers reachable from these routes enforce authentication.
- **`tests/cross-cutting/write-routes-are-guarded.test.ts`** — asserts that the three `POST` routes are protected by the auth chain.

## Notes

- The `router.use(...)` call is placed **before** the individual `router.get`/`router.post` lines, so it applies to all routes without needing per-route middleware. Adding a new route below it inherits the gate automatically; adding one above it would bypass it.
- The `/reservations/sweep` path contains a nested segment (`/reservations/sweep`), unlike the other flat paths — routing middleware or API clients must match the full segment.
- The file's module-level doc comment references `docs/modules/inventory.md` for broader context on why no public inventory routes exist.
