---
source: src/modules/orders/tests/integration/fulfillment-filter.test.ts
sha256: 1cd0e4720784187cc50d8a6b7fab800dafe154f7ee19e80fdb4378f21d9beb40
generated_at: 2026-10-15T11:14:36.714022+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/fulfillment-filter.test.ts

## Purpose

Integration test that verifies the `fulfillmentStatus` query filter on `GET /orders` produces correct results against a real MongoDB instance. It proves that the Mongo query conditions for each fulfillment value select exactly the orders whose serialized `fulfillmentStatus` matches, and that the filter intersects with (rather than replaces) the caller's existing scope. The pure serialization logic is covered separately in `unit/fulfillment.test.ts`; this file closes the gap between in-memory logic and the database.

## Key elements

- **`buyerOrder(status)`** — Creates a unique buyer (incrementing a module-level `buyers` counter for distinct emails) and an order with one product line in the given `OrderStatus`.
- **`orderWith(status, fulfillment?)`** — Wraps `buyerOrder`; if a partial `FulfillmentSummary` is supplied, directly writes it into the order's `fulfillment` subdocument via `orderModel.updateOne`, then returns the order id as a string.
- **`listed(fulfillmentStatus)`** — Calls `orderService.search({ fulfillmentStatus }, {})` and extracts the array of order ids.
- **`describe('listing by fulfillmentStatus')`** — Three tests:
  - *selects each value's orders and no others* — Seeds one order per fulfillment value, asserts exact set membership for all six values.
  - *agrees with the value each listed order serializes with* — Seeds ambiguous orders (e.g. `processing` + both `onHold` and `remaining`), confirms the returned `fulfillmentStatus` field matches the filter that selected them.
  - *narrows the caller's own scope instead of replacing it* — Seeds two delivered orders, searches with both `fulfillmentStatus: 'fulfilled'` and a `_id` constraint, expects only the scoped order.

## Relationships

- **`orderService`** (`src/modules/orders/services/index.ts`) — System under test; `search()` is the method whose filter logic is validated.
- **`orderModel`** (`src/modules/orders/model.ts`) — Used to write the `fulfillment` subdocument directly into Mongo, bypassing the service layer.
- **`FulfillmentSummary`** (`src/modules/orders/domain/index.ts` → `domain/fulfillment.ts`) — Type constraining the partial fulfillment fields the test writes.
- **`createOrder`, `toOrderItem`** (`src/modules/orders/tests/factories.ts`) — Factories for building valid order documents.
- **`createUser`** (`src/modules/users/tests/factories.ts`) — Creates the buyer account.
- **`createProduct`** (`src/modules/products/tests/factories.ts`) — Creates the product referenced by the order line.
- **`OrderStatus`, `OrderFulfillmentStatus`** (`src/types/index.ts`) — Union types for status literals used in test setup and assertions.
- **`setupTestDb`** (`tests/support/setup-test-db.ts`) — Initializes and resets the in-memory Mongo instance for the test file.

## Notes

- `setupTestDb()` is called at module top-level (not in `beforeAll`), so the DB is guaranteed clean before any test runs.
- The `buyers` counter is module-scoped and never reset within the file; it only needs to be unique per order, not across files.
- Tests rely on the DB being empty of other orders (provided by `setupTestDb`); they assert exact array equality, not subset containment.
- `.toSorted()` (ES2023) is used for order-independent comparisons, avoiding mutation of the expected array.
- The `orderWith` helper writes `fulfillment` fields with explicit zero defaults (`shipped: false`, `remaining: 0`, etc.) before spreading the partial override, so the subdocument shape is always complete regardless of which fields the caller supplies.
