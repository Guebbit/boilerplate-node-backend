---
source: src/modules/orders/tests/integration/order-number.test.ts
sha256: 33d0c0ea8d7e05a167284bf12d98b56a0ab13601c8c1db92574ce578616ca150
generated_at: 2026-11-08T07:06:48.181380+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/order-number.test.ts

## Purpose

Integration test verifying that `GET /orders/{id}` returns the order number exactly as it was set at creation time. It runs against a real HTTP server with a fresh test database, confirming the field is persisted and surfaced unchanged.

## Key elements

- **`setupTestDb()`** — called at module load to create/seed a clean test database before the suite runs.
- **`describe('GET /orders/{id} — the order number on the response')`** — the single test block; one test case inside.
- **`it('publishes the order number frozen at creation')`** — authenticates as `admin`, creates a product and an order (with `orderNumber: '2026-000041'`), issues a real HTTP `GET`, and asserts `response.body.orderNumber` equals the value supplied at creation.

## Relationships

- **`@tests/contract`** — imported for side effects (test contract / assertion setup).
- **`@tests/setup-test-db`** — provides `setupTestDb`, which provisions the test database.
- **`@tests/http`** — provides the `api()` HTTP client and `authenticateAs` helper used to make the authenticated request.
- **`@modules/products/tests/factories`** — provides `createProduct`, used to build a valid product reference for the order item.
- **`@modules/orders/tests/factories`** — provides `createOrder` and `toOrderItem`, used to construct the order fixture with a specific `orderNumber`.

## Notes

- The module JSDoc explicitly scopes this test to the **order's** number field. The invoice's number-and-date block is covered separately in `src/modules/invoicing/tests/unit/emails.test.ts` — don't extend this file for invoice concerns.
- The order number is *supplied* by the test (`'2026-000041'`) rather than auto-generated, so the test verifies round-trip persistence, not generation logic.
- Despite the "integration" label in the path, the assertion is a simple equality check on one field; there is no sequencing or numbering-algorithm logic under test here.
