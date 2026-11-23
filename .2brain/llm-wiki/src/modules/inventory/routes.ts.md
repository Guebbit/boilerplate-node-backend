---
source: src/modules/inventory/routes.ts
source_sha256: 34aebef7faa57243ea521fa034dc0170aa2c2f4ce8c034d59c61769a01368c8f
context_sha256: 0564d12ad8e8713c51b46e6ffc7d26d0b8f1607af9f4d9121a97bfcd12969c42
generated_at: 2026-11-22T05:21:02.028503+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/routes.ts

## Purpose
Defines the Express route table for the inventory module. Every route is staff-only; there is deliberately no customer-facing route, since shoppers see stock only via `available` on the product. Routes require different permission keys: `manager` can read levels without moving stock, while `warehouse` moves stock through `create:StockMovement`.

## Key elements
- `router` — the exported Express `Router`.
- `router.use(getAuth, isAuthOrCredential)` — applied to all routes. It accepts either a user session or an `sk_...` API key, so warehouse systems can call the module machine-to-machine.
- `GET /levels` — the stock board, scarcest first (`read:StockLevel` → `getInventoryLevels`).
- `GET /levels/:productId` — one product's counters (`read:StockLevel` → `getInventoryLevel`).
- `GET /preorders` — the preorder board: allowance, outstanding, paid vs unpaid (`read:StockLevel` → `getPreorderLevels`).
- `GET /movements` — the ledger, newest first (`read:StockLevel` → `getStockMovements`).
- `PATCH /levels/:productId` — edits the level; today this is only the backorder allowance (`update:StockLevel` → `patchInventoryLevel`). It is absolute, so no idempotency key is needed.
- `POST /levels/:productId/receive` — a supplier delivery (`create:StockMovement` + required idempotency key `receive-stock` → `postReceipt`).
- `POST /levels/:productId/adjust` — a signed stocktake correction (`create:StockMovement` + required idempotency key `adjust-stock` → `postAdjustment`).
- `POST /reservations/sweep` — clears expired reservation holds on demand (`sweep:StockLevel` → `postReservationsSweep`).

## Relationships
- `src/kernel/middlewares/authorizations.ts` supplies `getAuth`, `isAuthOrCredential` and `requirePermission`.
- `src/infrastructure/http/middlewares/idempotency.ts` supplies `requireIdempotencyKey`, configured with an `operation` name and `subjectParam: 'productId'` on the receive and adjust routes.
- The `src/modules/inventory/controllers/*` files (`get-inventory-levels.ts`, `get-inventory-level.ts`, `get-preorder-levels.ts`, `get-stock-movements.ts`, `patch-inventory-level.ts`, `post-receipt.ts`, `post-adjustment.ts`, `post-reservations-sweep.ts`) each supply the handler for exactly one route, as listed above.
- `src/modules/inventory/module.ts` is a neighbor in the graph, but this file shows no direct interaction with it. `src/modules/inventory/tests/unit/routes.test.ts` is the unit test for this route table.

## Notes
- The idempotency key is required on receive and adjust. A retried request must replay rather than double-count stock.
- The sweep route is only an on-demand door. The real schedule is `npm run sweep:reservations` (`docker/crontab`), which calls `runReservationSweep` in-process and never reaches this route. It uses the `sweep` verb rather than `manage`, and no preset role is meant to reach it directly.
- Movement writes use `StockMovement`, while level edits and reads use `StockLevel`. Editing a level changes a record without moving stock.
