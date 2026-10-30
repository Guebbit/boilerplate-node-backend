---
source: src/modules/orders/tests/integration/order-number.test.ts
sha256: 33d0c0ea8d7e05a167284bf12d98b56a0ab13601c8c1db92574ce578616ca150
generated_at: 2026-10-29T04:54:27.195273+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/order-number.test.ts

## Purpose

Integration test that verifies the order number is correctly published on the `GET /orders/{id}` HTTP response. It confirms the number is frozen at creation time (not regenerated or mutated on read) by creating an order with an explicit number and asserting it round-trips through a real HTTP call.

## Key elements

- **`setupTestDb()`** — initialises a test database before the suite runs.
- **Test: "publishes the order number frozen at creation"** — authenticates as admin, creates a product and an order with `orderNumber: '2026-000041'`, issues a real `GET /orders/{id}`, and asserts the response body contains that exact string.

## Relationships

- **`tests/support/setup-test-db.ts`** — provides `setupTestDb` to bootstrap the test database.
- **`tests/support/http.ts`** — provides the `api` HTTP client and `authenticateAs` for bearer-token auth.
- **`tests/support/contract.ts`** — imported for side-effects (type-level or runtime contract helpers used by the test harness).
- **`src/modules/products/tests/factories.ts`** — supplies `createProduct` to build a valid product for the order.
- **`src/modules/orders/tests/factories.ts`** — supplies `createOrder` and `toOrderItem` to build the order fixture with a chosen `orderNumber`.

## Notes

- The module doc comment explicitly scopes this test to the order number on the HTTP response and points to `src/modules/invoicing/tests/unit/emails.test.ts` for the invoice's own number-and-date block — do not conflate the two.
- The test uses a hardcoded order number (`'2026-000041'`) rather than a generated one; this is intentional to assert the value is *frozen* (i.e., persisted verbatim, not recomputed on read).
