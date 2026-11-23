---
source: src/modules/cart/tests/contract/api.contract.test.ts
source_sha256: 12596c6c34ebadcbbfbf562cb86c93e231c0a4b9290826ae2f0bf7f44bbb8ed8
context_sha256: 813e7907623c846323058eece025f7e926fe9b43c18e95cc777e1d621392ca28
generated_at: 2026-11-22T04:37:25.970877+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/tests/contract/api.contract.test.ts

## Purpose
Contract tests for the `/cart` API. Every route requires authentication and returns the same `CartResponseEnvelope`, so this suite checks that serialization stays consistent across all six endpoints. Carts are built through the API rather than fixtures, because `CartResponse` is a computed view and not a serialization of the stored document. Behavioural rules belong to the service suites. These tests only make sure each contract branch is reached.

## Key elements
- `setupTestDb()`: sets up the test database for the suite.
- `authenticateWithCart(quantity = 2)`: local helper. It logs in a `user`, gives them an address (every checkout order carries a billing address), creates a product, and POSTs it to `/cart/items`. It throws a descriptive error if setup does not return 200, and returns `{ bearer, product }`.
- `mergeOnce(bearer, key, quantity, id)`: sends `POST /cart/merge` with one guest line. It sets the `Idempotency-Key` header only when a key is given.
- `heldOf(bearer, id)`: reads `GET /cart` and returns the quantity held for a product, or 0 if absent.
- `describe('GET /cart')`: covers these cases:
  - empty cart.
  - cart with items.
  - a line over stock, which is flagged `availability: 'insufficient_stock'` with `checkoutable: false`.
  - a line at the per-line ceiling, which has `canIncrease: false`.
  - the total printed as decimal text with currency (`'51.00'`, `'EUR'`), with no `expectedTotal` property in the summary.
- `describe('POST /cart/items')`: covers these cases:
  - adding an item returns 200 with no `Location` header and the whole cart.
  - adding to an existing line grows it (2 + 3 = 5).
  - a 422 with `CART_QUANTITY_LIMIT` when the per-line ceiling is exceeded, both for an existing line and for a new line.
  - a 404 for a nonexistent product and for an inactive product outside the public catalogue.
- `describe('POST /cart/items — who may shop')`: `it.each` over eight roles (`customer`, `unverified`, `manager`, `warehouse`, `support`, `editor`, `moderator`, `admin`). Each must get 200 when adding to the cart.
- `describe('POST /cart/merge')`: covers these cases:
  - the response has `lines` (per-line `requested`, `resulting`, `availability`) plus `cart`.
  - 100 guest lines are accepted and 101 are refused with 422.
  - per-line reasons are returned in request order (this test is cut off in the visible portion).

## Relationships
- `@tests/http` provides `api`, `authenticateAs`, `authenticateAsRole` and `staleBearerFor`. All requests and authentication go through it.
- `@tests/environment` provides `withEnvironmentOverrides`, used to override `NODE_CART_LINE_MAX_QUANTITY`.
- `@tests/contract` is imported for its side effects.
- `@tests/ids` provides `MISSING_ID` for the nonexistent-product 404.
- Factories from `addresses/tests/factories` (`giveAddress`), `products/tests/factories` (`createProduct`), `orders/tests/factories` (`createOrder`, `toOrderItem`) and `users/tests/factories` (`createUser`) seed data.
- `@tests/checkout-as` (`checkoutAs`, `shownTotal`), `@tests/callers` (`testCallerContext`), `productService` from `@modules/products`, `t` from `@infrastructure/i18n` and `settleOutboxNudges` from `@kernel/outbox` are imported. The visible portion does not use them yet, so they are presumably for later tests, such as checkout, stale-bearer, or outbox scenarios.

## Notes
- Cart writes answer 200 with the full cart, never 201 or a `Location` header.
- "Add to cart" grows an existing line instead of replacing it.
- The default per-line ceiling is 10. Tests lower or pin it through environment overrides.
- The `/cart/merge` guest-line limit is 100 per request.
