---
source: tests/integration/checkout-money-reconciliation.test.ts
sha256: 286cff2c4b5b42539f1b625794b08586238775c2c6677c7f8cc2be546f6a04fd
generated_at: 2026-11-08T09:35:50.214736+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/checkout-money-reconciliation.test.ts

## Purpose

Integration test that drives three real HTTP endpoints — `GET /cart`, `POST /cart/checkout`, and `POST /payments` — with the same basket and asserts all three return the **identical** total in integer minor units. It complements the pure-logic property test (`delivery/tests/unit/money-reconciliation.property.test.ts`) by exercising the paths where a number is assembled a second time over the wire. Covers non-whole-cent prices, the free-shipping boundary, and a currency (JPY) whose minor unit is a whole unit rather than a hundredth.

## Key elements

- **`minorUnitsOf(price, exponent)`** — Converts a decimal price string to integer minor units using half-up rounding, reading digits directly (no float multiplication) so the oracle stays exact.
- **`expectedMinor(lines, method, exponent)`** — The independent oracle: per-unit rounded minor units × quantity + flat shipping (zeroed when the lines' decimal total meets `freeAbove`).
- **`spelled(minor, exponent)`** — Formats integer minor units back to the wire's decimal-string form (`"19.90"` at 2 places, `"1990"` at 0) by digit manipulation, never division.
- **`expectedPrices(lines, method, exponent)`** — Returns the expected `total`, `itemsTotal`, and `shipping` strings for the three doors.
- **`expectReconciled(prices, expected)`** — Shared assertion block: order `totalPrice`, intent `amount`, cart `itemsTotal`, and cart `shippingCost` must each match the oracle.
- **`priceThroughHttp(shopper, lines, method, canceller?)`** — Drives one basket through cart → checkout → payment intent → order cancel, returning the three price representations.
- **`newShopper()`** — Creates an authenticated user with a saved address via `authenticateAs` + `giveAddress`.
- **`EUR_CASES`** — Eight hardcoded edge-case baskets (sub-cent prices, free-shipping boundary, zero-price items, multi-line express).
- **`RUN`** — Shared fast-check config: fixed seed `20_261_005`, run count from `PROPERTY_RUNS_WITH_DATABASE`, `endOnFailure: true`.
- **`SHIPPING`** — Local constant mirroring the three shipping methods and their `flat`/`freeAbove` rules.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/http.ts` | Imports `api` (supertest wrapper) and `authenticateAs` (creates a user + bearer token). |
| `tests/support/checkout-as.ts` | Imports `checkoutAs` to perform `POST /cart/checkout` and receive the order id. |
| `tests/support/setup-test-db.ts` | Calls `setupTestDb()` at module top to prepare the test database. |
| `tests/support/environment.ts` | Imports `withEnvironmentOverrides` to swap `NODE_DEFAULT_CURRENCY` for the JPY block. |
| `tests/support/knobs.ts` | Imports `PROPERTY_RUNS_WITH_DATABASE` for the fast-check run count. |
| `src/modules/addresses/tests/factories.ts` | Imports `giveAddress` to seed a shipping address for each shopper. |
| `src/modules/products/tests/factories.ts` | Imports `createProduct` to create catalogue items with the generated price. |
| `src/modules/delivery/tests/unit/fulfillment.test.ts` | Not imported; referenced in the module doc-comment as the pure-logic counterpart that this file complements. |

## Notes

- **Canceller pattern:** Each basket leaves an unpaid order. Because a single shopper hits `CART_OPEN_ORDER_LIMIT_REACHED` after a few, the property test reuses one shopper but cancels via a *second* admin bearer (`admin.bearer`). A shopper cancelling their *own* order would trigger a purchase hold that blocks their next checkout.
- **Float safety in the oracle:** `minorUnitsOf` and `spelled` operate on digit strings, never on `Number` arithmetic at the cent level, so `1.005 × 100` drift can never contaminate the expected value.
- **Sub-cent prices:** The fast-check generator produces 3-decimal prices (e.g. `"0.123"`). The comment notes the product factory may reject these via the API, yet the three views must still agree on whatever amount is stored.
- **JPY exponent is 0:** Shipping's flat fee is expressed in whole-yen units; the test asserts no code path silently multiplies by 100.
- **Seed is fixed** (`20_261_005`) for reproducibility; run count is environment-controlled via the `knobs` module.
