---
source: src/modules/orders/tests/integration/order-tax-fields.test.ts
sha256: e1a2c092993d1823dd9a4db37a75a41dda0cd3c703f954931ecc3d8985ff10ff
generated_at: 2026-10-29T04:54:49.577851+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/order-tax-fields.test.ts

## Purpose

Integration test for `GET /orders/{id}` that asserts every order response carries a complete VAT breakdown—per-line `taxRate`, `taxAmount`, `netAmount` as well as order-level `netTotal` and `taxTotal`. It exists to pin the shape and arithmetic of the tax fields returned by the order read endpoint.

## Key elements

- **`taxedLine(productId, price, taxRate)`** – local helper that shapes a frozen order line the way `freezeOrderLines` would produce it at checkout: a nested `product` object (id, title, price, taxRate) plus a `quantity`.
- **Single test** (`publishes netTotal/taxTotal and every line tax field`) – creates a product (taxRate 0.22) and an order with one line (price 19.9 × qty 2), hits `GET /orders/{id}` as admin, and asserts:
  - line `product.taxRate` = 0.22
  - line `taxAmount` = 7.18
  - line `netAmount` = 32.62
  - order `netTotal` = 32.62
  - order `taxTotal` = 7.18

## Relationships

- **`src/modules/orders/tests/factories.ts`** – provides `createOrder`, which builds the order fixture used in the test.
- **`src/modules/products/tests/factories.ts`** – provides `createProduct`, used to seed a real product with a tax rate.
- **`tests/support/http.ts`** – provides `api()` (supertest wrapper) and `authenticateAs('admin')` for the authenticated request.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` resets/initialises the test database before the suite runs.
- **`tests/support/contract.ts`** – imported as a side-effect (`import '@tests/contract'`), likely registering global expectations or typing helpers for the test environment.

## Notes

- The module doc comment explicitly scopes the test: the *order response* VAT fields are in scope here; the *invoice document's* own VAT table is a separate concern owned by `src/modules/invoicing/tests/unit/emails.test.ts`.
- Tax arithmetic follows the "tax-inclusive price" convention: `net = gross / (1 + rate)`, `tax = gross − net`. With price 19.9, qty 2, rate 0.22 → gross 39.80 → net 32.62 → tax 7.18.
- The test runs as a single `it` block inside one `describe`; there is no parameterised matrix of rates. Adding a second tax rate requires a new test case, not a loop.
