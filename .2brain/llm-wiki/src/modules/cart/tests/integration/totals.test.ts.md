---
source: src/modules/cart/tests/integration/totals.test.ts
sha256: 40dac1bce776646fac56e1efd3eeda13d1c4a7fc5dd6921b6402a6545e1f8c21
generated_at: 2026-11-08T05:23:46.630414+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/totals.test.ts

## Purpose

Integration test that verifies the cart's `totalPrice` matches the amount carried by the resulting order and payment intent. It guards against a class of bugs where summing decimal amounts separately (vs. summing integer minor units and converting once) introduces floating-point epsilon drift — e.g. `0.56 + 5.00` in float arithmetic.

## Key elements

- **Module doc comment** — documents the invariant: all three (cart, order, intent) must agree; the total is computed in integer minor units and converted once.
- **`describe("the cart total is the amount the order and the intent will carry")`** — single suite; no sub-describes.
- **`it.each([...])`** — three parametrized cases (`0.56/1 → 5.56`, `0.69/1 → 5.69`, `1.06/1 → 6.06`). Each case: authenticates, creates a product at the given price, adds it to the cart, selects *standard* shipping, then asserts both `cart.body.summary.totalPrice` and `checkout.body.totalPrice` equal the expected string.
- **`setupTestDb()`** — called once at module scope to reset the test database before the suite runs.

## Relationships

- **`tests/support/setup-test-db.ts`** — `setupTestDb()` seeds/resets the database before any test in this file executes.
- **`tests/support/http.ts`** — provides `api()` (HTTP client) and `authenticateAs()` (creates a user + bearer token); used for every request in the test.
- **`tests/support/checkout-as.ts`** — `checkoutAs(bearer)` initiates the full checkout flow and returns the 201 response containing the order/payment-intent `totalPrice`.
- **`src/modules/products/tests/factories.ts`** — `createProduct({ price, onHand })` creates the product under test at a specific price.
- **`src/modules/addresses/tests/factories.ts`** — `giveAddress(user.id)` ensures the user has a shipping address so the shipping-method step and checkout can proceed.

## Notes

- The three price values (`0.56`, `0.69`, `1.06`) were chosen because they historically produced a one-cent discrepancy when added to a $5.00 shipping cost using naive float addition. If you add a case, pick a price that triggers the same edge case rather than an arbitrary one.
- Expected totals are **strings** (`'5.56'`), not numbers — the API serializes money as fixed-point strings.
- `setupTestDb()` is a top-level call (not inside `beforeEach`), so it runs exactly once for the entire file. Adding a new `describe` block in this file does **not** re-run it.
