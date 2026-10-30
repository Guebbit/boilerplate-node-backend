---
source: src/modules/cart/tests/integration/totals.test.ts
sha256: 69c0735d93442b6619f2ce2aec8d42118552eae9a106358bcd05e0fc7cb9d464
generated_at: 2026-10-29T03:30:26.776070+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/totals.test.ts

## Purpose

Integration test verifying that the cart's `totalPrice` is the exact amount carried by the order and payment intent. It guards against floating-point epsilon drift that occurs when two decimal values (item price + shipping) are summed as floats rather than converted to integer minor units first.

## Key elements

- **`it.each` table** — three cases (`0.56`, `0.69`, `1.06` item price with standard shipping at $5.00) chosen specifically because naive float addition of those pairs produces a 1-cent rounding error in IEEE 754.
- **Test flow (per case)** — authenticate user → attach a shipping address → create a product at the given price → `POST /cart/items` → `PUT /cart/shipping-method` (standard) → `GET /cart` → `checkoutAs` → assert both `cart.body.summary.totalPrice` and `checkout.body.totalPrice` equal the expected integer-correct total.
- **`setupTestDb()`** — called once at module scope to prepare a clean database before the suite runs.

## Relationships

- **`tests/support/setup-test-db.ts`** — imports `setupTestDb`; invoked once to provision/reset the test database.
- **`tests/support/http.ts`** — imports `api` and `authenticateAs`; used for all HTTP requests and to obtain a bearer token.
- **`tests/support/checkout-as.ts`** — imports `checkoutAs`; performs the checkout step and returns the response (status 201 + `totalPrice`).
- **`src/modules/addresses/tests/factories.ts`** — imports `giveAddress`; creates a shipping address for the test user so the shipping method step is valid.
- **`src/modules/products/tests/factories.ts`** — imports `createProduct`; creates a product with a specific `price` and `onHand` for each case.

## Notes

- The module doc comment documents the *why*: prices are summed in integer minor units and converted to major units only once. Adding two 2-decimal floats directly (e.g. `0.56 + 5.00`) can differ by a float epsilon; this test pins that behaviour.
- The test asserts **both** the cart summary and the checkout response carry the same total, ensuring the value shown to the user matches what the payment intent receives.
- Standard shipping is hardcoded as `$5.00` (the `shippingMethodId: 'standard'` value is assumed to resolve to that rate in the test environment).
