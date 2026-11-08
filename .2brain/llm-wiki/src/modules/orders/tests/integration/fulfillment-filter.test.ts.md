---
source: src/modules/orders/tests/integration/fulfillment-filter.test.ts
sha256: 1cd0e4720784187cc50d8a6b7fab800dafe154f7ee19e80fdb4378f21d9beb40
generated_at: 2026-11-08T07:04:57.494827+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/fulfillment-filter.test.ts

## Purpose

Integration test that proves the `fulfillmentStatus` query filter on `GET /orders` is semantically identical to the value each order serializes back to the caller, verified against a real MongoDB instance. It complements the pure-logic coverage in `unit/fulfillment.test.ts` by exercising the actual Mongo query conditions.

## Key elements

- **`buyerOrder(status)`** — Creates a fresh buyer (unique email via `buyers` counter) and an order in the given `OrderStatus`.
- **`orderWith(status, fulfillment?)`** — Builds an order via `buyerOrder`, then writes a `fulfillment` summary document directly through `orderModel.updateOne`; returns the order id as a string.
- **`listed(fulfillmentStatus)`** — Thin wrapper around `orderService.search({ fulfillmentStatus }, {})` that extracts just the item ids.
- **"selects each value's orders and no others"** — Creates one order per fulfillment value (unfulfilled, on_hold, in_progress, partially_fulfilled, shipped, fulfilled) and asserts each filter returns exactly the matching id set.
- **"agrees with the value each listed order serializes with"** — Verifies that orders returned by a filter carry the same `fulfillmentStatus` string in their serialized output (round-trip consistency).
- **"narrows the caller's own scope instead of replacing it"** — Confirms `fulfillmentStatus` composes with an existing `_id` constraint rather than overriding it.

## Relationships

- **`src/modules/orders/services/index.ts`** — `orderService.search` is the API under test.
- **`src/modules/orders/model.ts`** — `orderModel` is used to write `fulfillment` fields directly into Mongo, bypassing the service layer.
- **`src/modules/orders/domain/index.ts`** — Source of the `FulfillmentSummary` type imported for the `orderWith` helper.
- **`src/modules/orders/tests/factories.ts`** — Provides `createOrder` and `toOrderItem`.
- **`src/modules/products/tests/factories.ts`** — Provides `createProduct` for order line items.
- **`src/modules/users/tests/factories.ts`** — Provides `createUser` for distinct buyers.
- **`src/types/index.ts`** — `OrderStatus` and `OrderFulfillmentStatus` enum/type definitions.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` provisions the real Mongo instance for the test.

## Notes

- Every order in this file needs a **unique buyer email**; the module-level `buyers` counter guarantees that. If the unique-email constraint is changed, the counter pattern breaks.
- Fulfillment fields are written **directly via the Mongoose model** (`orderModel.updateOne`), not through the service—this is intentional: the test validates the *read* path (filter + serialization) against known *write* state.
- `toSorted()` (non-mutating, ES2023) is used for order-independent array comparison; requires a runtime that supports it.
- The module docstring explicitly scopes this as the *integration* half; the pure table-lookup logic is tested elsewhere in `unit/fulfillment.test.ts`.
