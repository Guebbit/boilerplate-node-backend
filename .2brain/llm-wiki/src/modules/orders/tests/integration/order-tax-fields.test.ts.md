---
source: src/modules/orders/tests/integration/order-tax-fields.test.ts
source_sha256: 408df5c678258fc0fbcdbe158d96cc29f8ca0fd64cd1b2419bd568ef52457d99
context_sha256: 4c8a48aaaa6efa2f94f531222b49b9e03f6e51eaa90b30bb952fad0200425f6b
generated_at: 2026-11-22T06:30:33.925542+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/integration/order-tax-fields.test.ts

## Purpose
Integration test for the VAT fields returned by `GET /orders/{id}`. It checks that an order's response carries a full VAT breakdown on each line and at the order level. The VAT table in the invoice document belongs to the `invoicing` module and is tested separately (`src/modules/invoicing/tests/unit/emails.test.ts`).

## Key elements
- `setupTestDb()`: called at module level to prepare the test database.
- `taxedLine(productId, price, taxRate)`: helper that builds an order line shaped like the output of `freezeOrderLines` at checkout. It has a product snapshot (`id`, title `'Taxed Product'`, `price`, `taxRate`) and `quantity: 2`.
- Test `publishes netTotal/taxTotal and every line tax field`:
  - Authenticates as `admin` and creates a product and an order with one line (price `'19.90'`, rate `0.22`).
  - Requests `GET /orders/{id}` with the bearer token.
  - Expects status 200 and these values:
    - `items[0].product.taxRate` is `0.22`.
    - `items[0].taxAmount` is `'7.18'`.
    - `items[0].netAmount` is `'32.62'`.
    - `netTotal` is `'32.62'`.
    - `taxTotal` is `'7.18'`.

## Relationships
- `@modules/products/tests/factories`: `createProduct()` supplies the product whose id goes into the line.
- `@modules/orders/tests/factories`: `createOrder(user, lines)` persists the order that the endpoint then reads.
- `@tests/setup-test-db`: `setupTestDb()` provides the database lifecycle for the suite.
- `@tests/http`: `api()` is the HTTP client, and `authenticateAs('admin')` returns `{ bearer, user }`.
- `@tests/contract`: imported for its side effects only. Its contents are not visible in this file.

## Notes
- Monetary amounts are strings in the response, while `taxRate` is a number.
- The expected numbers imply gross-inclusive pricing. 19.90 × 2 = 39.80 gross, of which 7.18 is tax and 32.62 is net.
- The order is created directly from a pre-frozen line, so the test does not go through checkout or `freezeOrderLines`.
