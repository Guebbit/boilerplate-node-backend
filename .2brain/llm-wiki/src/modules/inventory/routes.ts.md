---
source: src/modules/inventory/routes.ts
sha256: 6a2b94d7174a938fd9a1c23d04bca197c9a77c53d5ae53c8a4a06db0e5a5ad51
generated_at: 2026-10-14T15:56:28.087981+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/routes.ts

## Purpose

Defines the staff-facing Express router for the inventory module. All stock-level, movement, and adjustment endpoints live here; customer-facing stock visibility is exposed through each product's `available` field rather than through any route in this file.

## Key elements

- **`router`** (exported `Router`) — the single public export; mounted by `module.ts`.
- **Global middleware** — `getAuth` → `isAuthOrCredential`: every route requires authentication, and the credential branch admits `sk_…` API keys used by warehouse/M2M systems.
- **`GET /inventory/levels`** — stock board (scarcest first); permission `inventory.any.read`.
- **`GET /inventory/preorders`** — preorder allowance / outstanding / paid-vs-unpaid board; permission `inventory.any.read`.
- **`PUT /inventory/levels/:productId/preorder-limit`** — set the per-product preorder cap; permission `inventory.any.create`. No idempotency key because the value is absolute (retried writes are naturally harmless).
- **`GET /inventory/movements`** — stock ledger, newest first; permission `inventory.any.read`.
- **`POST /inventory/receipts`** — record a supplier delivery; permission `inventory.any.create` + `idempotencyKey` middleware.
- **`POST /inventory/adjustments`** — record a signed stocktake correction; permission `inventory.any.create` + `idempotencyKey` middleware.
- **`POST /inventory/reservations/sweep`** — on-demand expiry of holds; permission `inventory.any.sweep` (no preset role maps to it).

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — supplies `getAuth`, `isAuthOrCredential`, and `requirePermission`, the three middleware functions applied to every route.
- **`src/infrastructure/http/middlewares/idempotency.ts`** — supplies the `idempotencyKey` middleware, applied only to the two state-changing POSTs (receipts, adjustments).
- **`src/modules/inventory/controllers/*`** — each route delegates its handler to a dedicated controller function (`getInventoryLevels`, `getStockMovements`, `getPreorderLevels`, `putPreorderLimit`, `postReceipt`, `postAdjustment`, `postReservationsSweep`).
- **`src/modules/inventory/module.ts`** — mounts this `router` into the application.
- **`src/modules/inventory/tests/unit/routes.test.ts`** — unit-tests route registration, middleware ordering, and permission assignments.

## Notes

- **No idempotency on `PUT …/preorder-limit`.** The handler sets an absolute value, so a duplicate request is inherently safe; adding an idempotency key would be redundant.
- **Sweep is a side door, not the primary path.** The production schedule (`npm run sweep:reservations` via `docker/crontab`) calls `runReservationSweep` in-process and never hits this route. The HTTP route exists for operators or external schedulers that prefer HTTP over a cron container.
- **Permission keys are intentionally granular** (`read` / `create` / `sweep`). See `shared/authorization-keys.yaml` for the full mapping and rationale.
- **Customer-facing stock is not a route here by design.** Exposing counters publicly would leak sales velocity to competitors and create FOMO pressure on shoppers.
