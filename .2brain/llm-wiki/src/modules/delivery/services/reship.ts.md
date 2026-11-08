---
source: src/modules/delivery/services/reship.ts
sha256: c70a8503f6c3ca0aba4bf4b302f7e3bdd46557dd6e332b778f03622aa17377b5
generated_at: 2026-11-08T05:39:16.891809+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/reship.ts

## Purpose

Implements the **reship (replacement under legal guarantee)** workflow. When returned goods must be sent out again, this file reopens the *same* fulfillment orders (no new order, invoice, or revenue), tops up the stock hold, routes any shortfall into a new owed fulfillment order, and resets the order to `processing` so the replacement exits through the ordinary shipping pipeline. It always executes inside the caller's Mongoose transaction (a return's receipt) and is all-or-nothing.

## Key elements

- **`reopenForReplacement`** (exported) — The single public entry point. Reads the order, plans reopenings via `planReopening`, tops up stock, reopens fulfillment-order lines, creates an owed fulfillment order if the shelf can't cover everything, reports progress, and reverts the order status.
- **`reopenLines`** (private) — Iterates over planned reopenings, applies loss/owed splitting with `withLoss`, and persists each line change via `fulfillmentOrderRepository.claim` with optimistic-revision check.
- **`reopenOrder`** (private) — Maps the order's current status to the correct `orderService` call (`markReshipped` for `delivered`, `markReopened` for `shipped`); no-op if already `processing`; refuses on `canceled`/`unpaid`.

## Relationships

- **`../domain` (index → `reship.ts`, `lost.ts`, `fulfillment.ts`)** — Consumes pure planning/derivation helpers: `planReopening`, `shareOwed`, `statusOfLines`, `withLoss`, and the `ProductQuantity` / `Reopening` types.
- **`../repository`** — Calls `fulfillmentOrderRepository.findByOrderId` (read) and `.claim` (optimistic-update write) to mutate fulfillment orders.
- **`../model`** — Imports the `FulfillmentOrderDocument` type for line/revision access.
- **`./act`** — Imports `refuse` to throw a `409 DELIVERY_NOT_REOPENABLE` `ActRefusal` that aborts the caller's transaction.
- **`./owed`** — Imports `createOwedFulfillmentOrder` and `promiseFor` to spawn the hold-order for units the shelf cannot fulfill.
- **`./progress`** — Imports `reportProgress` to advance the order's progress state after lines are reopened.
- **`@modules/orders`** — Calls `orderService.readOrder`, `.topUpStock`, `.markReshipped`, `.markReopened` to coordinate order-level status and stock.
- **`@types`** — Uses `FulfillmentOrderKind`, `FulfillmentOrderStatus`, `OrderStatus` enums for branching logic.

## Notes

- **Caller owns the transaction and stock-cache refresh.** This module never opens its own session nor invalidates the catalogue cache; it assumes the receipt handler provides `session` and handles cache invalidation.
- **No new order is created.** The replacement reuses the original fulfillment orders and the original order document; only a separate *owed* fulfillment order may appear for the shortfall.
- **Optimistic concurrency:** `reopenLines` passes `origin.revision` to `claim`; a mismatch returns `null` and triggers a 409 refusal rather than silently overwriting.
- **`actor` is nullable.** It is passed through to the order-service status-change methods and may be `null` or `undefined` (e.g., system-triggered receipts).
