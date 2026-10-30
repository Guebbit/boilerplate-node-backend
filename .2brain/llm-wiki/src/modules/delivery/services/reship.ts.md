---
source: src/modules/delivery/services/reship.ts
sha256: 888851a8b57b496112afcbb765fc028c34db5e6682b4cad0d4ed4a160545d4da
generated_at: 2026-10-29T03:43:27.219201+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/reship.ts

## Purpose

Implements the replacement-after-return flow: reopens already-delivered or shipped fulfillment orders so the same units can leave again under the legal guarantee. No new order, invoice, or revenue is created — the original fulfillment orders are re-claimed with updated lines, the stock hold is topped up, any shortfall the shelf cannot cover is parked on a dedicated owed fulfillment order, and the parent order is transitioned back to `processing` to re-enter the ordinary shipping pipeline.

## Key elements

- **`reopenForReplacement`** (exported) — Orchestrates the full reship. Reads the order, plans reopenings, tops up stock, reclaims fulfillment-order lines, creates an owed order if needed, reports progress, and transitions the order status. All-or-nothing within the caller's transaction.
- **`reopenLines`** (private) — For each planned reopening, computes the surviving lines (`withLoss`) and calls `fulfillmentOrderRepository.claim` with optimistic-concurrency revision check. Refuses 409 if any claim fails.
- **`reopenOrder`** (private) — Maps the parent order's current status to the appropriate `orderService` transition (`markReshipped` for `delivered`, `markReopened` for `shipped`). No-op if already `processing`; refuses otherwise.

## Relationships

- **`../domain/index.ts`** (`src/modules/delivery/domain/index.ts`) — Consumes `planReopening`, `shareOwed`, `statusOfLines`, `withLoss` (pure domain logic) and the `ProductQuantity` / `Reopening` types.
- **`../repository.ts`** — Calls `fulfillmentOrderRepository.findByOrderId` and `.claim` to read and re-open fulfillment orders.
- **`../model.ts`** — Imports the `FulfillmentOrderDocument` type used for typed order documents.
- **`./act.ts`** — Imports `refuse` for structured 409 error responses.
- **`./owed.ts`** — Imports `createOwedFulfillmentOrder` and `promiseFor` to park shelf-uncoverable units.
- **`./progress.ts`** — Imports `reportProgress` to update order-level progress after re-opening.
- **`@modules/orders`** (`src/modules/orders/index.ts`) — Calls `orderService.readOrder`, `.topUpStock`, `.markReshipped`, `.markReopened`.
- **`@types`** (`src/types/index.ts`) — Imports `FulfillmentOrderKind`, `FulfillmentOrderStatus`, `OrderStatus` enums.
- **`./index.ts`** (`src/modules/delivery/services/index.ts`) — Barrel re-exports `reopenForReplacement`.

## Notes

- **Transaction is owned by the caller.** The Mongoose `ClientSession` is passed in; this file never opens or commits its own transaction. Any `refuse` call aborts the caller's transaction atomically.
- **Stock-cache refresh is external.** The doc comment explicitly states the catalogue's stock cache is the caller's responsibility to invalidate after a successful reship.
- **`reopenLines` silently skips missing orders.** The `if (!origin) continue` guard means a stale `reopenings` list that references an already-deleted fulfillment order will be ignored rather than throwing. In practice this should not occur because both lists come from the same query, but it is a silent no-op.
- **Owed-order fallback ID.** If `orders[0]` is undefined (empty array), the owed order falls back to `order._id` directly — a defensive path that should not fire in normal flow.
