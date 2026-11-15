---
source: src/modules/inventory/routes.ts
sha256: e4664a7a9bcb2db46c9a567423f0386db47bdff38fa38b46cfa18773df31fc5d
generated_at: 2026-11-14T20:05:51.460059+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/routes.ts

## Purpose
Express router that maps all staff-facing inventory HTTP endpoints to their controllers. Customer-facing stock visibility is deliberately absent (it surfaces via `available` on the product resource instead). Authentication accepts both session auth and `sk_…` API keys, reflecting that warehouse/ERP integrations talk to this surface.

## Key elements
- **`router`** (exported `Router`) — the single public export of this module.
- **Route table** (8 endpoints):
  - `GET /levels` → `getInventoryLevels` — stock board, scarcest first.
  - `GET /levels/:productId` → `getInventoryLevel` — single-product counters.
  - `GET /preorders` → `getPreorderLevels` — allowance, outstanding, paid/unpaid breakdown.
  - `PATCH /levels/:productId` → `patchInventoryLevel` — edits backorder allowance (absolute value; does not move stock).
  - `GET /movements` → `getStockMovements` — stock ledger, newest first.
  - `POST /levels/:productId/receive` → `postReceipt` — supplier delivery.
  - `POST /levels/:productId/adjust` → `postAdjustment` — signed stocktake correction.
  - `POST /reservations/sweep` → `postReservationsSweep` — on-demand expiry of stale holds.
- **Auth chain** (`getAuth` → `isAuthOrCredential`) applied via `router.use`; every subsequent route is behind it.
- **Permission gates** — `requirePermission('read'|'update'|'create'|'sweep', …)` narrows access per route.
- **Idempotency gate** — `requireIdempotencyKey` applied to `receive` and `adjust` only.

## Relationships
- **`src/kernel/middlewares/authorizations.ts`** — provides `getAuth`, `isAuthOrCredential`, and `requirePermission`; every route depends on all three.
- **`src/infrastructure/http/middlewares/idempotency.ts`** — provides `requireIdempotencyKey`; invoked on the two stock-movement POST routes.
- **`src/modules/inventory/controllers/*`** (8 files) — each route delegates its handler to one controller function in this directory.
- **`src/modules/inventory/module.ts`** — consumer of the exported `router`; registers it into the application's route tree.
- **`src/modules/inventory/tests/unit/routes.test.ts`** — unit-tests that the route table wires the correct middleware and controller per path/verb.

## Notes
- `isAuthOrCredential` (not `isAuth`) is intentional: `sk_…` API keys must reach these routes for machine-to-machine warehouse integrations.
- Idempotency is **required** on `receive` and `adjust` (delta-based, retry-unsafe) but **absent** on `PATCH` (absolute write, naturally idempotent).
- The sweep route uses the custom `sweep` permission verb; no preset role maps to it. The production cron (`docker/crontab` → `npm run sweep:reservations`) calls `runReservationSweep` **in-process** and never hits this route.
- Permission keys (`read:StockLevel`, `update:StockLevel`, `create:StockMovement`, `sweep:StockLevel`) are defined in `shared/authorization-keys.generated.yaml`, not in this file.
