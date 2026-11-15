---
source: src/modules/orders/tests/integration/fulfillment-filter.test.ts
sha256: 220ae6f7c10ec9589d75a488fc24d7aa6f87c88b30af03dd1a8fcbcd22cc71be
generated_at: 2026-11-14T20:50:53.833537+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/fulfillment-filter.test.ts

## Purpose

Integration test that verifies the `GET /orders?fulfillmentStatus=` filter against a real MongoDB instance. It confirms that the database query conditions select exactly the same set of orders that the `FulfillmentSummary` table would assign to each value, closing the gap left by the pure unit tests in `unit/fulfillment.test.ts`.

## Key elements

- **`buyers`** – Module-level counter that increments per order so each synthetic buyer gets a unique email address.
- **`buyerOrder(status)`** – Creates a fresh user + product + order in one step; returns the order document.
- **`orderWith(status, fulfillment?)`** – Wraps `buyerOrder`, then optionally overwrites the `fulfillment` subdocument via `orderModel.updateOne` to simulate a specific summary state. Returns the order id as a string.
- **`listed(fulfillmentStatus)`** – Calls the order service search with the given filter and extracts the resulting ids.
- **`describe('listing by fulfillmentStatus')`** – Four test cases:
  - *selects each value's orders and no others* – Creates one order per fulfillment bucket and asserts each filter returns only its own order(s).
  - *selects awaiting_shipment as paid or processing orders, partly shipped included* – Verifies `awaiting_shipment` covers paid/processing (including partly-shipped) but excludes pending, shipped, and a paid-then-canceled order.
  - *agrees with the value each listed order serializes with* – Filters by `on_hold` and `partially_fulfilled`, then asserts the serialized `fulfillmentStatus` on returned items matches the filter used.
  - *narrows the caller's own scope instead of replacing it* – Confirms the filter composes with an existing `_id` scope rather than overriding it.

## Relationships

- **`tests/support/setup-test-db.ts`** – Called at module top level to provision a clean MongoDB instance for the suite.
- **`src/modules/orders/tests/factories.ts`** – Supplies `createOrder` and `toOrderItem` used by every fixture.
- **`src/modules/users/tests/factories.ts`** – Supplies `createUser` for distinct buyer accounts.
- **`src/modules/products/tests/factories.ts`** – Supplies `createProduct` for the order line item.
- **`src/types/index.ts`** – Provides `OrderStatus` enum and the `OrderFulfillmentFilter` union type.
- **`src/modules/orders/services/index.ts`** – The imported order service module; the test calls its search method to exercise the production query path under test.
- **`src/modules/orders/model.ts`** – Exports `orderModel`, used directly to mutate the `fulfillment` subdocument and the `paidAt` field for edge-case fixtures.
- **`src/modules/orders/domain/index.ts`** → **`src/modules/orders/domain/fulfillment.ts`** – Source of the `FulfillmentSummary` type and the value-assignment logic this test cross-checks.

## Notes

- The `buyers` counter is intentional mutable module state; it guarantees unique emails across tests within a single file run without requiring a shared registry.
- Fulfillment summary fields are set via a raw `orderModel.updateOne` rather than through a service method, because the test's goal is the *query* path, not the *write* path.
- The `awaiting_shipment` test inserts a canceled order with `paidAt` set and no refund stamp to confirm it is still excluded (i.e., cancellation removes it from the "out" pool regardless of payment state).
- Array comparisons use `.toSorted()` (non-mutating, ES2023+) to avoid side-effects from in-place sorting.
