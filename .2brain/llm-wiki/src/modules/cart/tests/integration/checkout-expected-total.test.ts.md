---
source: src/modules/cart/tests/integration/checkout-expected-total.test.ts
source_sha256: 9c286c47947585f4cc69e2e8c9255594a98b9c8c9264a6580a2c5a880c1fefa7
context_sha256: f59ee51d46a52aef8158d214deba69ea3e2b07b0d57648098a5b7c3fd6b8f9e7
generated_at: 2026-11-22T04:38:10.139287+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/tests/integration/checkout-expected-total.test.ts

## Purpose
Integration tests for `POST /cart/checkout` and its required `expectedTotal` field (the total the buyer was shown). The checkout must refuse any other total, because a price, shipping cost or the basket can change between the cart screen and "Place order", and a price change does not bump the cart's version. The tests assert the invariant: a refused checkout leaves no order, no held stock and the cart unchanged, and the refusal carries both totals so the UI can show the new one.

## Key elements
- `shopperWith(price, quantity = 2)` — local helper. It authenticates a `user`, gives them an address, creates a product (`onHand: 10`), adds `quantity` units via `POST /cart/items`, and sets shipping to `pickup` (free) via `PUT /cart/shipping-method`. It returns `{ bearer, product }`.
- `describe('POST /cart/checkout and the total the buyer was shown')` — the only suite. Its cases cover:
  - **Happy path:** the named total matches, so the response is 201 with `totalPrice` `'20.00'`.
  - **Price moved:** the response is 409 with code `CART_TOTAL_CHANGED` and `details` holding `expected` and `actual` (`20.00` vs `24.00`, EUR).
  - **No side effects after a refusal:** `countOrders()` is 0, `countersOf(...).reserved` is 0, and the cart still has 1 item.
  - **Confirm the new total:** after a 409, resending `details.actual` as `expectedTotal` gives 201 with `totalPrice` `'24.00'`.
  - **Currency mismatch:** USD with the same amount is refused with 409.
  - **Basket changed:** a line added after the total was read gives 409 with `actual.amount` `'30.00'`.
  - **Amount spelling:** `'20'` and `'20.00'` are equivalent, giving 201.
  - **Input errors (422):** too many decimal places (`details.field` is `expectedTotal.amount`), a missing `expectedTotal`, and malformed totals via `it.each` (negative, numeric amount, `EURO`, lowercase `eur`, missing currency).
  - **Stock first:** a short line gives 409 `CART_INSUFFICIENT_STOCK` instead of a price refusal.

## Relationships
- `tests/support/http.ts` — supplies `api()` (the HTTP client used for cart calls) and `authenticateAs`.
- `tests/support/checkout-as.ts` — supplies `checkoutAs` (places the checkout, with an optional `expectedTotal`) and `shownTotal` (reads the total the cart shows).
- `tests/support/setup-test-db.ts` — `setupTestDb()` is called at module level to prepare the test database.
- `tests/support/callers.ts` — provides `testCallerContext`, passed to the service calls below.
- `src/modules/products/tests/factories.ts` — `createProduct` and `countersOf`.
- `src/modules/addresses/tests/factories.ts` — `giveAddress`.
- `src/modules/orders/tests/factories.ts` — `countOrders`.
- `src/modules/products/index.ts` — exports `productService`, whose `updateById` changes a product's price mid-flow.
- `src/modules/inventory/index.ts` — exports `inventoryService`, whose `adjust` lowers stock for the stock-first test.
- `src/modules/products/services/index.ts` and `src/modules/inventory/services/index.ts` are graph neighbors, but the file does not import them directly.

## Notes
- Price and stock changes go through the real services (`productService`, `inventoryService`) rather than the HTTP API, so they simulate changes made behind the buyer's back.
- Refusal semantics: 409 `CART_TOTAL_CHANGED` means the total moved or does not match, including by currency. 422 means the input itself is invalid (format, missing field), not a moved cart.
- Stock is checked before the total: with insufficient stock and a stale total, the response is `CART_INSUFFICIENT_STOCK`.
- All tests use EUR and pickup shipping, so totals are `price × quantity`.
