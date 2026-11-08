---
source: src/modules/inventory/routes.ts
sha256: 8aa93cb33f496211eaa26eff4a156a132c520fe410813090b6a79381687e5b0b
generated_at: 2026-11-08T06:01:22.183324+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/routes.ts

## Purpose

Defines the Express router for all inventory endpoints. Every route is staff-only; the customer-facing half of inventory (the `available` flag on a product) is not exposed here as a route. This file is the single wiring point that maps URL paths, permission checks, and middleware to the inventory controllers.

## Key elements

- **`router`** (exported) — the sole export; an Express `Router` carrying all inventory routes.
- **`getAuth, isAuthOrCredential`** (applied via `router.use`) — auth gate for every route. `isAuthOrCredential` (not plain `isAuth`) allows `sk_…` API keys, making this the M2M surface for warehouse systems.
- **`requirePermission(…)`** — per-route authorization. Read routes need `read:StockLevel`; the PATCH edit needs `update:StockLevel`; both POST movement routes need `create:StockMovement`; the sweep route needs `sweep:StockLevel`.
- **`idempotencyKey`** — applied only to the two POST routes (`/receive`, `/adjust`) so retried requests replay rather than double-apply a stock delta.
- **Controller handlers** — `getInventoryLevels`, `getInventoryLevel`, `getPreorderLevels`, `getStockMovements`, `patchInventoryLevel`, `postReceipt`, `postAdjustment`, `postReservationsSweep` — imported from `./controllers/*` and attached to their respective paths.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — source of `getAuth`, `isAuthOrCredential`, and `requirePermission`; provides the auth and permission primitives every route depends on.
- **`src/infrastructure/http/middlewares/idempotency.ts`** — source of the `idempotencyKey` middleware; guarantees at-least-once delivery safety on the two mutating POST routes.
- **`src/modules/inventory/controllers/*`** (8 files) — each controller is the terminal handler for one route in this table; they contain the actual business logic.
- **`src/modules/inventory/module.ts`** — mounts this `router` into the application's route tree.
- **`src/modules/inventory/tests/unit/routes.test.ts`** — unit-tests the route table (paths, method, middleware order, permission keys).

## Notes

- **Idempotency is selective, not blanket.** Only the two POST movement routes carry `idempotencyKey`. The PATCH route is intentionally exempt: it sets an absolute value (max backorder), so a retry is naturally idempotent.
- **The sweep route is not the cron path.** `docker/crontab` calls `runReservationSweep` in-process; this `POST /reservations/sweep` endpoint exists solely for an operator or an external scheduler that prefers HTTP over a sidecar container.
- **No public routes.** Stock counts, the ledger, and preorder boards are never exposed to customers through this router; a shopper only sees the `available` boolean on a product resource elsewhere.
