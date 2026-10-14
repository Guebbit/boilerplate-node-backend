---
source: src/modules/cart/tests/integration/totals.test.ts
sha256: 7819b077cca43c6299b23d47f73ff29220b5681f369855079880e80dd6777eda
generated_at: 2026-10-14T15:19:05.048895+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/totals.test.ts

## Purpose

Integration test that verifies the cart's `totalPrice` is identical to the value carried by the resulting order and payment intent. It guards against floating-point drift by exercising prices (e.g. 0.56) where summing two decimals directly would differ by an epsilon from the expected total.

## Key elements

- **Module docblock** — states that all monetary amounts are summed in integer minor units and converted once (`orderTotal`), rather than adding decimal floats.
- **`describe("the cart total is the amount the order and the intent will carry")`** — single test group; the `it.each` inside covers three price cases (0.56, 0.69, 1.06) each with quantity 1 on standard shipping.
- **Test flow (per case)** — authenticate user → seed an address → create a product at the given price → `POST /cart` → `PUT /cart/shipping-method` (standard) → `GET /cart` → `checkoutAs` → assert `checkout.body.data.totalPrice` equals the expected total **and** equals `cart.body.data.summary.totalPrice`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/setup-test-db.ts` | `setupTestDb()` is called once at module load to prepare a clean database. |
| `tests/support/http.ts` | Provides `api()` (supertest wrapper) and `authenticateAs()` used for every HTTP call in the test. |
| `tests/support/checkout-as.ts` | `checkoutAs(bearer)` performs the full checkout and returns the 201 response containing `totalPrice` on the order/intent. |
| `src/modules/addresses/tests/factories.ts` | `giveAddress(user.id)` seeds a shipping address so checkout is valid. |
| `src/modules/products/tests/factories.ts` | `createProduct({ price, onHand })` creates a product at the exact decimal price under test. |

## Notes

- Standard shipping is implicitly **$5.00** (derived from the expected totals, e.g. 0.56 + 5.00 = 5.56). There is no explicit shipping-fee fixture in this file; the assertion depends on that constant living in the shipping-method configuration.
- The three chosen prices (0.56, 0.69, 1.06) were selected because `0.56 + 5.00` is a known floating-point trap in JS; the test confirms the codebase avoids it by working in integer minor units.
- The test asserts **both** the cart summary and the checkout response carry the same `totalPrice`, ensuring the cart display and the payment intent never diverge.
