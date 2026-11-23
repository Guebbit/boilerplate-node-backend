---
source: src/modules/orders/tests/integration/order-number.test.ts
source_sha256: 33d0c0ea8d7e05a167284bf12d98b56a0ab13601c8c1db92574ce578616ca150
context_sha256: 4c8a48aaaa6efa2f94f531222b49b9e03f6e51eaa90b30bb952fad0200425f6b
generated_at: 2026-11-22T06:30:20.663146+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/integration/order-number.test.ts

## Purpose
Integration test that checks the order number is exposed over real HTTP. It verifies that `GET /orders/{id}` returns the `orderNumber` that was stored when the order was created. The invoice's own number-and-date block is out of scope here. The module doc says it is covered in `src/modules/invoicing/tests/unit/emails.test.ts`.

## Key elements
- `setupTestDb()`: called at module level to set up the test database for the suite.
- `describe('GET /orders/{id} — the order number on the response')`: the single suite.
- Test `publishes the order number frozen at creation`:
  - Authenticates as `admin` with `authenticateAs('admin')`, which gives a `bearer` token and a `user`.
  - Creates a product with `createProduct()`.
  - Creates an order for that user with one item, built by `toOrderItem(product, 1)`, and a preset `orderNumber` of `'2026-000041'`.
  - Calls `GET /orders/<id>` with the `Authorization` header set to the bearer token.
  - Expects status `200` and `response.body.orderNumber` equal to `'2026-000041'`.

## Relationships
- `@tests/contract` is imported only for its side effects. Its contents are not visible here.
- `@tests/setup-test-db` (`tests/support/setup-test-db.ts`) provides `setupTestDb`.
- `@tests/http` (`tests/support/http.ts`) provides `api` (the HTTP client) and `authenticateAs` (auth helper).
- `@modules/products/tests/factories` (`src/modules/products/tests/factories.ts`) provides `createProduct`.
- `@modules/orders/tests/factories` (`src/modules/orders/tests/factories.ts`) provides `createOrder` and `toOrderItem`.

## Notes
- The test seeds `orderNumber` directly through the factory rather than generating it. It therefore checks that the value is returned unchanged, not how numbers are generated.
- The `@tests/*` and `@modules/*` path aliases are used for imports.
