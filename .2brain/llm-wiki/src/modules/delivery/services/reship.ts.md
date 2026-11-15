---
source: src/modules/delivery/services/reship.ts
sha256: c4eae7b6d96dd014603ec80691d78a1ef069aec2d9d2597a68b20d96e67b8e61
generated_at: 2026-11-14T19:50:11.373812+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/reship.ts

## Purpose

Implements the replacement-after-return flow: when delivered goods are returned under legal guarantee, this file reopens the **same** fulfillment orders to ship replacement units. No new order, invoice, or revenue is created. It tops up the stock hold, parks any shelf-uncoverable quantity on a new owed fulfillment order, and reverts the parent order to `processing` so the replacement ships through the normal pipeline. All mutations run inside the caller's transaction.

## Key elements

- **`reopenForReplacement`** (exported) — Main entry point. Reads the order, calls `planReopening` to decide per-fulfillment-order allocations, tops up stock, reopens lines, creates an owed fulfillment order if the shelf can't cover everything, reports progress, and reopens the order for fulfillment. Throws `409 DELIVERY_NOT_REOPENABLE` on any conflict.
- **`reopenLines`** (module-private) — Iterates over planned reopenings, computes final lines via `withLoss`, and claims each fulfillment order with its new lines and status. Uses the order's `revision` for optimistic concurrency; refuses if the claim fails.

## Relationships

- **`src/modules/delivery/domain/index.ts`** — Imports `planReopening`, `shareOwed`, `statusOfLines`, `withLoss` and the types `ProductQuantity`, `Reopening`. The domain decides *how* to split units and allocate owed portions across orders.
- **`src/modules/delivery/repository.ts`** — Loads the order's fulfillment orders and persists (claims) the reopened lines under optimistic concurrency.
- **`src/modules/delivery/model.ts`** — Uses `FulfillmentOrderDocument` as the shape of loaded orders.
- **`src/modules/delivery/services/owed.ts`** — Calls `createOwedFulfillmentOrder` to park uncovered quantity on a dedicated hold order, and `promiseFor` to derive a promise date.
- **`src/modules/delivery/services/progress.ts`** — Calls `reportProgress` to signal the order is active again.
- **`src/modules/delivery/services/act.ts`** — Uses `refuse` to raise the standard `409` refusal.
- **`src/modules/orders/index.ts`** — Reads the order, tops up the stock hold, and reopens the order for fulfillment (moving it back to `processing`).
- **`src/types/index.ts`** — Imports `FulfillmentOrderKind` and `FulfillmentOrderStatus` enums.
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** — Exercises the domain planning logic this service depends on.

## Notes

- **Transaction boundary:** The function accepts a `ClientSession` and performs no commit. Every refusal rolls back the caller's receipt transaction. The caller owns refreshing the catalogue stock cache.
- **Optimistic concurrency:** `reopenLines` passes `origin.revision` into the repository claim; a concurrent mutation (e.g., a parallel return) causes a `409` refusal rather than a silent overwrite.
- **Same-order guarantee:** Replacement units are attached to the *existing* fulfillment orders by id. No new order document is created for the shipped portion—only for the owed portion (via `createOwedFulfillmentOrder`).
- **Status gating:** `orderService.reopenForFulfillment` is expected to move a `delivered` or `shipped` order back to `processing`; any other state results in a refusal.
