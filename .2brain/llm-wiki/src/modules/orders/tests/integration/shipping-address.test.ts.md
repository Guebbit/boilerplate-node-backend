---
source: src/modules/orders/tests/integration/shipping-address.test.ts
sha256: d3f8f7390a87c5ef6ebf68aad287241bb493741f77d6c8a0ba9bb6d4068e6c12
generated_at: 2026-10-29T04:57:44.994527+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/shipping-address.test.ts

## Purpose

Integration tests for the staff endpoint `PUT /orders/{id}/shipping-address`. Verifies that correcting an order's shipping address is encrypted at rest, audit-logged without leaking address content, gated on fulfillment state, restricted to staff, validated against the shop's supported countries, and visible to the buyer as a plain address swap with no timeline entry.

## Key elements

- **`BEFORE` / `AFTER`** — Fixed address fixtures (same person, different street/zip) used as the "old" and "new" addresses across all tests.
- **`seedPaidOrder(status?)`** — Creates a real user, a product, and a paid (or specified-status) order with the `BEFORE` address; returns the order and a buyer bearer token.
- **`jest.mock('@infrastructure/observability/audit', …)`** — Replaces the audit infrastructure module with `auditPortMock()` from `tests/support/ports.ts` so tests can assert on emitted events without hitting a real sink.
- **`setupTestDb()`** — Boots a real database for the integration run.
- **`describe('PUT /orders/{id}/shipping-address', …)`** — Nine test cases covering:
  - Encryption (raw DB document must not contain the new street name)
  - Audit event: exactly one `ADMIN_ORDER_ADDRESS_CORRECTED` row, naming the order but not the address
  - Buyer sees the new address on the order but no timeline entry
  - `actions.correctAddress` flips to `false` and the PUT returns 409 `ORDER_ADDRESS_LOCKED` once `fulfillment.remaining` hits 0
  - Partial shipment (`remaining > 0`) still allows the correction; the last unit closes it
  - Unsupported country → 422 `ORDER_SHIP_TO_COUNTRY_NOT_SUPPORTED`, DB unchanged
  - Order with no pre-existing address → 409
  - Buyer gets 403; unknown order id → 404
  - Incomplete or empty address fields → 422

## Relationships

- **`src/infrastructure/observability/audit.ts`** — The module under test's audit emission path; fully replaced by `auditPortMock` so tests assert on the port contract rather than a real emitter.
- **`src/modules/orders/audit.ts`** — Provides the `ordersAuditActions.ADMIN_ORDER_ADDRESS_CORRECTED` discriminator used to filter captured audit events.
- **`src/modules/orders/model.ts`** — `orderModel` is used for two things: (1) reading the raw document to verify encryption, and (2) `updateOne` calls to simulate `fulfillment.shipped` / `fulfillment.remaining` state transitions.
- **`src/modules/orders/tests/factories.ts`** — `createOrder` and `toOrderItem` build the seed order and its line item.
- **`src/modules/products/tests/factories.ts`** — `createProduct` supplies the product referenced by the order item.
- **`src/types/index.ts`** — `OrderStatus` enum used for the default and alternate statuses in `seedPaidOrder`.
- **`tests/support/http.ts`** — `api()`, `authenticateAs('user')`, `authenticateAsRole('admin')` drive all HTTP calls and auth.
- **`tests/support/ports.ts`** — `observePort` wraps the mocked audit function in a jest spy; `auditPortMock` is the factory returned by the `jest.mock` call.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` provisions the real database the tests run against.

## Notes

- The audit mock is **replaced, not spied on** (comment in the file). This is a deliberate convention documented in `tests/support/ports.ts`; do not swap it for a plain `jest.spyOn` without checking that file.
- Encryption assertions work by serializing the raw MongoDB document to JSON and asserting the new street name is absent — this only works because the field is field-level encrypted at the model layer.
- Country validation (`IT` supported, `US` not) is implicitly tied to whatever shop configuration the test environment loads; there is no explicit config set in this file.
- Fulfillment state is mutated directly via `orderModel.updateOne` to avoid exercising the shipping workflow — these tests isolate the address-correction logic.
- `order._id` is a MongoDB `ObjectId`; tests cast it with `String(order._id)` for URL interpolation.
