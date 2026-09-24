---
source: src/modules/inventory/routes.ts
sha256: f76f520f0e49289d184658dc9335665b8671c159ea00b3a849743510fcc273be
generated_at: 2026-09-23T18:45:58.834455+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/routes.ts

## Purpose

Defines the Express route table for the inventory module. It wires five staff-facing endpoints (stock levels, movement ledger, receipts, adjustments, and the reservation-sweep cron) to their respective controllers, applying the module's permission tier (`read` / `create` / `sweep`) and allowing both session auth and `sk_…` API keys. The customer-facing half of inventory is intentionally _not_ routed here.

## Key elements

- **`router`** (exported `Router`) — the single Express router instance for all inventory routes.
- **`router.use(getAuth, isAuthOrCredential)`** — global guard for every route in the file; distinguishes this from `isAuth` so that machine-to-machine `sk_…` keys are accepted.
- **`GET /inventory/levels`** → `getInventoryLevels` — stock board, scarcest first; requires `inventory.any.read`.
- **`GET /inventory/movements`** → `getStockMovements` — movement ledger, newest first; requires `inventory.any.read`.
- **`POST /inventory/receipts`** → `postReceipt` — records a supplier delivery; requires `inventory.any.create`.
- **`POST /inventory/adjustments`** → `postAdjustment` — records a stocktake correction; requires `inventory.any.create`.
- **`POST /inventory/reservations/sweep`** → `postReservationsSweep` — clears expired reservation holds (the expiry tick); requires `inventory.any.sweep`. Runs as `SYSTEM_ACTOR` (unrestricted).

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — provides `getAuth`, `isAuthOrCredential`, and `requirePermission`, which gate every route defined here.
- **Controllers (`get-inventory-levels`, `get-stock-movements`, `post-receipt`, `post-adjustment`, `post-reservations-sweep`)** — imported as the handler functions attached to each route.
- **`src/modules/inventory/module.ts`** — imports `router` from this file and mounts it at the `/inventory` path in the parent Express app.
- **`src/modules/inventory/tests/unit/routes.test.ts`** — unit-tests the route definitions, permission wiring, and handler delegation in this file.
- **`tests/support/routed-modules.ts`** — test-harness helper that registers this router so integration/e2e tests can hit the inventory endpoints.

## Notes

- The permission split is deliberate: `read` is a lower tier than `create`, so a `manager` role can view levels without the ability to move stock. The `sweep` verb exists specifically for the cron tick and is intentionally absent from any preset role (see `shared/authorization-keys.yaml`).
- `isAuthOrCredential` is used instead of `isAuth` because warehouse/ERP systems authenticate with `sk_…` API keys; only this module is designed for that M2M surface.
- The module-level JSDoc (`@module`) and inline comments document the _why_ behind each permission choice; treat them as the authoritative intent for any future route additions.
