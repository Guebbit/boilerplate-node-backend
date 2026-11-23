---
source: src/modules/cart/tests/integration/totals.test.ts
source_sha256: 40dac1bce776646fac56e1efd3eeda13d1c4a7fc5dd6921b6402a6545e1f8c21
context_sha256: a4ed117c14c603cda5ddbc6a639ee5699791cb7a845d355c9614c1609c5b787c
generated_at: 2026-11-22T04:42:28.136483+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/tests/integration/totals.test.ts

## Purpose
Integration test that checks the cart's `totalPrice` is the amount both the order (checkout) and the payment intent carry. It guards against float-epsilon errors: totals are summed in integer minor units and converted once (`orderTotal`), because adding decimals directly differs for some prices (e.g. 0.56 + 5.00).

## Key elements
- `setupTestDb()` call at module level: sets up the test database for the suite.
- `describe('the cart total is the amount the order and the intent will carry')` with one parameterised `it.each` test covering three cases (price → total, quantity 1, standard shipping):
  - `0.56` → `5.56`
  - `0.69` → `5.69`
  - `1.06` → `6.06`
- Each case:
  1. Authenticates a user (`authenticateAs`) and gives them an address (`giveAddress`).
  2. Creates a product with the given price and `onHand: 10` (`createProduct`).
  3. `POST /cart/items` with the product ID and quantity (expects 200).
  4. `PUT /cart/shipping-method` with `shippingMethodId: 'standard'` (expects 200).
  5. `GET /cart` (expects 200), then runs `checkoutAs(bearer)` and expects status 201.
  6. Asserts `checkout.body.totalPrice` and `cart.body.summary.totalPrice` both equal the expected string.

## Relationships
- `tests/support/http.ts`: provides `api()` (request helper) and `authenticateAs()` (returns `user` and `bearer`).
- `tests/support/checkout-as.ts`: provides `checkoutAs(bearer)`, which performs the checkout call.
- `tests/support/setup-test-db.ts`: provides `setupTestDb()` for DB lifecycle.
- `src/modules/addresses/tests/factories.ts`: `giveAddress(userId)` gives the user an address so checkout can proceed.
- `src/modules/products/tests/factories.ts`: `createProduct({ price, onHand })` creates the product to buy.

## Notes
- Prices and totals are strings with two decimals, not numbers.
- The expected totals imply a 5.00 standard shipping cost (0.56 + 5.00 = 5.56), though the test doesn't state it explicitly.
- The test only asserts the cart and checkout totals; it does not directly inspect the payment intent.
- Imports use the `@tests/...` and `@modules/...` path aliases.
