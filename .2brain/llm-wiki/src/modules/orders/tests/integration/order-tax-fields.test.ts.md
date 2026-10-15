---
source: src/modules/orders/tests/integration/order-tax-fields.test.ts
sha256: f6440f0065df2ab6fe20246897b302df21536d634b2114b4bf5c5d911dcd97db
generated_at: 2026-10-15T11:15:23.396988+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/order-tax-fields.test.ts

## Purpose

Integration test that verifies the `GET /orders/{id}` response includes a correct VAT breakdown — per-line `taxRate`, `taxAmount`, `netAmount` plus order-level `netTotal` and `taxTotal`. It guards against regressions where the order serialization drops or miscalculates tax fields.

## Key elements

- **`taxedLine(productId, price, taxRate)`** — local factory that shapes a frozen order line (product with `taxRate`, `quantity: 2`). Stands in for what the real `freezeOrderLines` step produces at checkout.
- **`describe('GET /orders/{id} — the VAT fields on the response')`** — single test asserting concrete numeric values: `taxRate = 0.22`, `taxAmount = 7.18`, `netAmount = 32.62`, `netTotal = 32.62`, `taxTotal = 7.18`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/orders/tests/factories.ts` | Provides `createOrder` to seed an order with the `taxedLine` fixture. |
| `src/modules/products/tests/factories.ts` | Provides `createProduct` to create the product referenced by the order line. |
| `tests/support/contract.ts` | Side-effect import; configures the contract/expect layer before assertions run. |
| `tests/support/http.ts` | Supplies `api()` (HTTP client) and `authenticateAs` (admin bearer token). |
| `tests/support/setup-test-db.ts` | `setupTestDb()` initializes and tears down the in-memory test database. |

## Notes

- The file-level JSDoc explicitly scopes the boundary: this test covers the **order's** VAT fields only. The invoice document's VAT table is a separate concern tested in `src/modules/invoicing/tests/unit/emails.test.ts`.
- `taxedLine` is a *test-local* shape, not a call into the production `freezeOrderLines` function. If the frozen-line shape changes in production, this helper must be updated manually.
- Single test, single request — intentionally narrow; additional tax scenarios (e.g. zero-rate, multi-line) would extend this file or a sibling.
