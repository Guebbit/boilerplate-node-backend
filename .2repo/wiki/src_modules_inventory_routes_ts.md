# src/modules/inventory/routes.ts

## Purpose

Defines the Express router for the inventory module. It wires the five inventory endpoints (stock levels, stock movements, receipts, adjustments, reservations sweep) to their respective controllers and enforces admin-only access at the router level. It exists so the inventory module exposes a single `router` that the app mounts under `/inventory`.

## Key elements

- **`router`** (exported) — the sole export; an Express `Router` instance with `getAuth`, `isAuth`, `isAdmin` applied as router-level middleware, making every route admin-gated.
- **`GET /levels`** → `getInventoryLevels` — returns stock levels, scarcest first ("the stock board").
- **`GET /movements`** → `getStockMovements` — returns the stock ledger, newest first.
- **`POST /receipts`** → `postReceipt` — records a supplier delivery.
- **`POST /adjustments`** → `postAdjustment` — records a signed stocktake correction.
- **`POST /reservations/sweep`** → `postReservationsSweep` — the reservation-expiry tick; the operator calling this endpoint acts as the cron trigger.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — supplies `getAuth`, `isAuth`, `isAdmin`; applied once at router level so no individual route needs its own auth chain.
- **`src/modules/inventory/controllers/get-inventory-levels.ts`** — handler for `GET /levels`.
- **`src/modules/inventory/controllers/get-stock-movements.ts`** — handler for `GET /movements`.
- **`src/modules/inventory/controllers/post-receipt.ts`** — handler for `POST /receipts`.
- **`src/modules/inventory/controllers/post-adjustment.ts`** — handler for `POST /adjustments`.
- **`src/modules/inventory/controllers/post-reservations-sweep.ts`** — handler for `POST /reservations/sweep`.
- **`src/modules/inventory/module.ts`** — imports this `router` and mounts it so the routes become part of the application.

## Notes

- There is deliberately **no public stock endpoint**. Customer-facing availability is surfaced via an `available` field on the product resource, not through this router. The file's comment explains the rationale (avoiding competitor intel and scarcity dark-patterns).
- The `reservations/sweep` endpoint is **operator-triggered**, not scheduled by a cron daemon. If a cron system is expected, it must call this URL manually.
- Because all auth middleware sits on `router.use(...)`, adding a new route to this file is automatically admin-gated without per-route middleware.
