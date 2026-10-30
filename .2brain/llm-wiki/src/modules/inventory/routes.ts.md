---
source: src/modules/inventory/routes.ts
sha256: 8aa93cb33f496211eaa26eff4a156a132c520fe410813090b6a79381687e5b0b
generated_at: 2026-10-29T04:02:36.480293+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/routes.ts

## Purpose

Defines the Express router for all staff-facing inventory HTTP endpoints (stock levels, preorder board, stock movements, receipts, adjustments, and the reservations sweep trigger). It exists to centralise routing, authentication, permission checks, and idempotency wiring so each controller stays a pure handler. The customer-facing half of the module is intentionally absent — shoppers see availability via the product's `available` field, not through these routes.

## Key elements

- **`router`** (exported) — the single Express `Router` instance for the inventory module. All routes are registered on it.
- **Global middleware** — `getAuth` → `isAuthOrCredential` applied via `router.use`, so every route accepts both session tokens and `sk_…` API keys.
- **GET `/levels`** — list stock levels (scarcest first); permission `read:StockLevel`; handler `getInventoryLevels`.
- **GET `/levels/:productId`** — single product's counters; permission `read:StockLevel`; handler `getInventoryLevel`.
- **GET `/preorders`** — preorder board (allowance, outstanding, paid/unpaid); permission `read:StockLevel`; handler `getPreorderLevels`.
- **PATCH `/levels/:productId`** — edit backorder allowance (absolute value); permission `update:StockLevel`; handler `patchInventoryLevel`. No idempotency key needed because the write is idempotent by design.
- **GET `/movements`** — stock-movement ledger, newest first; permission `read:StockLevel`; handler `getStockMovements`.
- **POST `/levels/:productId/receive`** — record a supplier delivery; permission `create:StockMovement`; requires `idempotencyKey`; handler `postReceipt`.
- **POST `/levels/:productId/adjust`** — signed stocktake correction; permission `create:StockMovement`; requires `idempotencyKey`; handler `postAdjustment`.
- **POST `/reservations/sweep`** — on-demand expiry of stale reservations; permission `sweep:StockLevel`; handler `postReservationsSweep`.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — supplies `getAuth`, `isAuthOrCredential`, and `requirePermission`, the three auth/permission primitives used on every route.
- **`src/infrastructure/http/middlewares/idempotency.ts`** — supplies the `idempotencyKey` middleware, inserted into the chain for the two stock-movement POST routes to prevent replay.
- **Controllers** (`get-inventory-levels`, `get-inventory-level`, `get-preorder-levels`, `get-stock-movements`, `patch-inventory-level`, `post-receipt`, `post-adjustment`, `post-reservations-sweep`) — each is the terminal handler for exactly one route defined here; they contain the business logic.
- **`src/modules/inventory/module.ts`** — the module composition root that mounts this router into the application.
- **`src/modules/inventory/tests/unit/routes.test.ts`** — unit tests exercising the route table (status codes, middleware ordering, permission enforcement).

## Notes

- **Auth is broader than typical:** the router uses `isAuthOrCredential` rather than bare `isAuth`, explicitly to allow `sk_…` API keys so an external warehouse system can talk to this module over HTTP.
- **Idempotency is selective:** only the two `create:StockMovement` POST routes carry `idempotencyKey`. The PATCH route is intentionally excluded because it writes an absolute value (a retry is naturally harmless).
- **Reservations sweep is a secondary door:** the primary schedule is `npm run sweep:reservations` (via `docker/crontab`), which calls `runReservationSweep` in-process and never hits this route. The HTTP route exists for operators or platform schedulers that prefer HTTP over a cron container.
- **Permission vocabulary:** `read`/`update` on `StockLevel` cover non-mutating and metadata edits; `create` on `StockMovement` covers actual stock movement; `sweep` on `StockLevel` is a bespoke verb (no preset role maps to it) reserved for the expiry operation.
