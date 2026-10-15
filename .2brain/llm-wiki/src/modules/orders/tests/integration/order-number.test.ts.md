---
source: src/modules/orders/tests/integration/order-number.test.ts
sha256: b62cc7a746f4d8fd4bc79bc71e41f861feb6c3533356ed34d27bfac8adf78d14
generated_at: 2026-10-15T11:15:01.525239+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/order-number.test.ts

## Purpose

Integration test that verifies the `orderNumber` field on the `GET /orders/{id}` HTTP response matches the value supplied at order creation. It exists to guard the contract that the number is frozen at write-time and returned verbatim on read, over a real HTTP round-trip.

## Key elements

- **`describe("GET /orders/{id} — the order number on the response")`** – single test block scoped to one assertion.
- **`it("publishes the order number frozen at creation")`** – creates a product and an order (with `orderNumber: '2026-000041'`), then asserts `response.body.data.orderNumber` equals that exact string with a `200` status.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/orders/tests/factories.ts` | Provides `createOrder` and `toOrderItem` used to build the order fixture. |
| `src/modules/products/tests/factories.ts` | Provides `createProduct` to produce a valid product for the order line. |
| `tests/support/contract.ts` | Side-effect import (sets up shared contract/test harness). |
| `tests/support/http.ts` | Supplies `api` (HTTP client) and `authenticateAs` (admin token). |
| `tests/support/setup-test-db.ts` | `setupTestDb()` is called at module load to prepare a clean database for the test. |

## Notes

- The module docblock explicitly defers the invoice number-and-date rendering to `src/modules/invoicing/tests/unit/emails.test.ts`; this file only covers the order entity's own `orderNumber` field.
- The order number is passed in at creation time rather than auto-generated, so the test asserts persistence/echo of a caller-supplied value, not a generation strategy.
