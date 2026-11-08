---
source: src/modules/orders/tests/integration/shipping-address.test.ts
sha256: d3f8f7390a87c5ef6ebf68aad287241bb493741f77d6c8a0ba9bb6d4068e6c12
generated_at: 2026-11-08T07:10:53.134571+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/shipping-address.test.ts

## Purpose

Integration tests for the `PUT /orders/{id}/shipping-address` endpoint. Verifies that staff can replace an order's shipping address while units remain unsent, that the stored value is encrypted, that audit/timeline entries record *who* acted but never *what* the address was, that unsupported countries are rejected with no write, and that the endpoint is locked once fulfillment is complete.

## Key elements

- **`BEFORE` / `AFTER`** – fixture address objects (Italy) used as the "old" and "new" values across every test.
- **`seedPaidOrder(status?)`** – helper that authenticates a user, creates a product and a paid (or processing) order with `BEFORE` as the shipping address; returns `{ order, buyer }`.
- **`describe('PUT /orders/{id}/shipping-address')`** – the suite containing 9 cases covering: encryption + timeline redaction, single audit emission, buyer visibility, `actions.correctAddress` toggle tied to `fulfillment.remaining`, partial-shipment window, unsupported-country 422, missing-address 409, 403 for buyer / 404 for unknown id, incomplete-address 422, and empty-field 422.
- **`jest.mock('@infrastructure/observability/audit', …)`** – replaces the audit module with `auditPortMock()` from `tests/support/ports.ts` (replaced, not spied).

## Relationships

- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is called at module level to provision a real MongoDB instance for integration assertions.
- **`tests/support/http.ts`** – provides `api()` (supertest wrapper), `authenticateAs`, and `authenticateAsRole` used in every request.
- **`tests/support/ports.ts`** – supplies `observePort` (to capture `emitAuditEvent` calls) and `auditPortMock()` (the replacement used in the `jest.mock` factory).
- **`src/infrastructure/observability/audit.ts`** – the module being replaced; its `emitAuditEvent` export is the observation target.
- **`src/modules/orders/audit.ts`** – `ordersAuditActions.ADMIN_ORDER_ADDRESS_CORRECTED` is used to filter the recorded audit rows.
- **`src/modules/orders/model.ts`** – `orderModel` is imported directly to (a) read the raw DB document and assert the plaintext street is absent (encryption check) and (b) update `fulfillment.shipped` / `fulfillment.remaining` to simulate shipping state transitions.
- **`src/modules/orders/tests/factories.ts`** – `createOrder` and `toOrderItem` build the seed order.
- **`src/modules/products/tests/factories.ts`** – `createProduct` creates the product line item.
- **`src/types/index.ts`** – `OrderStatus.paid` / `OrderStatus.processing` are passed to `seedPaidOrder`.

## Notes

- The audit port is **replaced**, not spied on, following the convention documented in `tests/support/ports.ts`; use `observePort` to inspect calls.
- Encryption is verified by string-searching the raw BSON document for the plaintext street fragment (`'14 Analytical'`)—it must be absent.
- The "unsupported country" test uses `'US'`; the supported country in fixtures is `'IT'`. Any test relying on country validation should respect this.
- Fulfillment state is mutated **directly via `orderModel.updateOne`** (bypassing the API) to reach partial/complete states; there is no helper in the factories for this.
- The "no shipping address" 409 case creates an order **without** a `shippingAddress` field in the factory options—do not add one.
