---
source: src/modules/orders/tests/integration/order-tax-fields.test.ts
sha256: 408df5c678258fc0fbcdbe158d96cc29f8ca0fd64cd1b2419bd568ef52457d99
generated_at: 2026-11-08T07:07:10.802255+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/order-tax-fields.test.ts

## Purpose

Integration test verifying that `GET /orders/{id}` returns a complete VAT breakdown: per-line tax fields (`taxRate`, `taxAmount`, `netAmount`) and order-level aggregates (`netTotal`, `taxTotal`). It exists to lock in the contract that every order response carries these fields on every line and at the top level.

## Key elements

- **`taxedLine(productId, price, taxRate)`** — local helper that shapes a frozen order line (product snapshot + quantity) the way `freezeOrderLines` produces it at real checkout. Used to seed a line with a concrete 22 % VAT rate.
- **`describe('GET /orders/{id} — the VAT fields on the response')`** — the single test suite.
- **`it('publishes netTotal/taxTotal and every line tax field')`** — the one test case: creates a product and an order via factories, calls the endpoint as `admin`, and asserts that the line carries `taxRate = 0.22`, `taxAmount = '7.18'`, `netAmount = '32.62'`, and the order carries matching `netTotal` / `taxTotal`.

## Relationships

- **`@modules/orders/tests/factories`** (`createOrder`) — creates the test order with the supplied taxed line.
- **`@modules/products/tests/factories`** (`createProduct`) — creates the product that the line references.
- **`@tests/http`** (`api`, `authenticateAs`) — provides the authenticated HTTP client used to hit the endpoint.
- **`@tests/setup-test-db`** (`setupTestDb`) — initialises the in-memory / test database before the suite runs.
- **`@tests/contract`** — imported as a side-effect module (test contract / global setup).

## Notes

- **Boundary with invoicing:** The module doc explicitly states that the invoice document's own VAT table is covered by `src/modules/invoicing/tests/unit/emails.test.ts`; this file only asserts the *order* response shape, not the rendered invoice.
- **Tax-inclusive pricing:** The line price (`19.90`) is gross. The expected split (`netAmount 32.62`, `taxAmount 7.18` for qty 2 at 22 %) confirms the API returns tax *extracted* from a tax-inclusive total, not added on top.
- **Decimal-as-string:** All monetary values in the assertions are strings (`'7.18'`, `'32.62'`), consistent with the codebase's convention of serialising money as fixed-point strings rather than numbers.
