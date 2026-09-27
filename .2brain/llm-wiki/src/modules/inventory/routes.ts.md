---
source: src/modules/inventory/routes.ts
sha256: 90f3eb247842ffa14d9bb707ebb0f0ce40ad62273da8478335cbe8b4df8ffaab
generated_at: 2026-09-27T14:56:18.716580+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/routes.ts

## Purpose
Express route table for the inventory module. Defines five staff-only endpoints (read stock levels/movements, post receipts/adjustments, trigger a reservations sweep) and wires the permission model that gates each one. No customer-facing routes exist here by design — shoppers see stock via the `available` field on products.

## Key elements
- **`router`** — the exported Express `Router`. Mounted at `/inventory` (by `module.ts`).
- **Global middleware chain** — `getAuth` → `isAuthOrCredential` applied via `router.use`, meaning both session auth and `sk_…` API keys are accepted for every route.
- **`GET /inventory/levels`** → `getInventoryLevels` — stock board, scarcest first. Requires `inventory.any.read`.
- **`GET /inventory/movements`** → `getStockMovements` — append-only ledger, newest first. Requires `inventory.any.read`.
- **`POST /inventory/receipts`** → `postReceipt` — records a supplier delivery (stock in). Requires `inventory.any.create`.
- **`POST /inventory/adjustments`** → `postAdjustment` — signed stocktake correction (stock out). Requires `inventory.any.create`.
- **`POST /inventory/reservations/sweep`** → `postReservationsSweep` — on-demand expiry of stale holds. Requires the dedicated `inventory.any.sweep` permission (no preset role holds it).

## Relationships
- **`src/kernel/middlewares/authorizations.ts`** — source of `getAuth`, `isAuthOrCredential`, and `requirePermission`; the three functions used in this file's middleware chain.
- **`controllers/get-inventory-levels.ts`**, **`get-stock-movements.ts`**, **`post-receipt.ts`**, **`post-adjustment.ts`**, **`post-reservations-sweep.ts`** — handler functions imported and mounted as route targets.
- **`src/modules/inventory/module.ts`** — mounts this `router` into the application's path tree.
- **`src/modules/inventory/tests/unit/routes.test.ts`** — unit-tests the route table (status codes, permission enforcement).
- **`tests/support/routed-modules.ts`** — test harness that boots the router in an integration context.

## Notes
- **`isAuthOrCredential`, not `isAuth`:** this is intentional — warehouse/integration systems authenticate with `sk_…` API keys and must reach every route here. Do not "simplify" to `isAuth`.
- **Sweep route vs. cron:** `docker/crontab` (`npm run sweep:reservations`) calls `runReservationSweep` in-process and never hits this HTTP route. The route exists for operators or external schedulers that prefer HTTP over a cron container.
- **Permission keys** (`inventory.any.read`, `inventory.any.create`, `inventory.any.sweep`) are defined in `shared/authorization-keys.yaml`; the sweep key is deliberately not assigned to any preset role.
- **No customer-facing routes:** stock visibility for shoppers is surfaced through the product's `available` field, not through an inventory endpoint.
