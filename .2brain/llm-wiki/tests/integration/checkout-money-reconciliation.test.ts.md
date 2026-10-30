---
source: tests/integration/checkout-money-reconciliation.test.ts
sha256: 1011411a0bf81f3e9e9d98e84d91856fad391b5a3d7eb34b1fc755a078f0a947
generated_at: 2026-10-29T06:52:54.342703+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/checkout-money-reconciliation.test.ts

## Purpose

Integration test that drives a single basket through three real HTTP doors—`GET /cart`, `POST /cart/checkout`, `POST /payments`—and asserts all three report the same monetary amount to the last minor unit. It complements the pure-composition property test in the delivery module by exercising the HTTP layer where amounts are re-assembled. Covers edge cases the pure suite cannot reach over the wire: sub-cent prices, free-shipping boundary crossings, and a currency with no minor unit (JPY).

## Key elements

- **`RUN`** – Fixed seed (`20_261_005`) and run count (`PROPERTY_RUNS_WITH_DATABASE`) for the fast-check property; `endOnFailure: true`.
- **`SHIPPING`** – Static definition of the three shipping methods (standard, express, pickup) with their flat rate and free-above threshold, mirroring `delivery/domain/rates.ts`.
- **`expectedMinor(lines, method, exponent)`** – Independent oracle. Computes the expected total in integer minor units using per-unit rounding (`Math.round(price * scale) * quantity`), then adds shipping. Never calls the code under test.
- **`expectedPrices(lines, method, exponent)`** – Decomposes the oracle total into `itemsTotal`, `shipping`, and `total` so a wrong line-item total cannot hide behind a correct grand total.
- **`priceThroughHttp(shopper, lines, method, canceller?)`** – Adds items to the cart, sets the shipping method, then hits all three doors in sequence. Returns the `Prices` triple. Cancels the resulting order to stay under `CART_OPEN_ORDER_LIMIT_REACHED`.
- **`expectReconciled(prices, expected)`** – Shared assertion: order total, payment-intent amount, cart itemsTotal, and cart shippingCost must each match the oracle.
- **`EUR_CASES`** – Eight table-driven cases targeting float drift, sub-cent fractions, free-shipping boundary (exact and just-under), multi-line baskets, and a zero-price item.
- **`newShopper()`** – Creates an authenticated user and attaches a shipping address via `giveAddress`.
- **JPY describe block** – Two cases wrapped in `withEnvironmentOverrides({ NODE_DEFAULT_CURRENCY: 'JPY' })`, testing whole-yen and fractional-yen (99.5) rounding with `exponent = 0`.

## Relationships

- **`tests/support/http.ts`** – Provides the `api()` Supertest wrapper and `authenticateAs` used for every HTTP call in the file.
- **`tests/support/checkout-as.ts`** – `checkoutAs` performs the `POST /cart/checkout` call that the inline `api().post(...)` cannot (it carries session-specific logic).
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is called at module load to seed/reset the shared test database.
- **`tests/support/environment.ts`** – `withEnvironmentOverrides` temporarily swaps `NODE_DEFAULT_CURRENCY` to JPY for the second describe block.
- **`tests/support/knobs.ts`** – Exports `PROPERTY_RUNS_WITH_DATABASE`, the run-count knob consumed by `RUN`.
- **`src/modules/addresses/tests/factories.ts`** – `giveAddress` creates a default shipping address for the test shopper.
- **`src/modules/products/tests/factories.ts`** – `createProduct` mints a catalogue product with the generated price so it can be added to the cart.
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** – Sibling delivery-domain test; the file's header comment points to its pure-composition counterpart as the non-HTTP proof of the same reconciliation invariant.

## Notes

- **Oracle independence.** `expectedMinor` and `expectedPrices` recompute the total from raw inputs using the documented per-unit rounding rule. They never import or call `money.ts` or any service under test.
- **Per-unit rounding, not basket-total rounding.** `Math.round(price * scale) * quantity` per line, not `Math.round(total * scale)`. A test that sums first and rounds once would produce different results.
- **Cancellation actor.** A shopper cancelling their own order triggers a purchase-hold that pauses subsequent checkouts. The property test therefore passes an **admin** bearer as the `canceller` parameter to `priceThroughHttp`, while the table tests (one shopper, one basket each) use the shopper's own token.
- **Sub-cent prices in the property test.** The fast-check generator emits both `cents/100` and `tenths/1000` prices. The comment notes the product factory writes sub-cent values the real API would refuse, but the three views must still agree on whatever the factory persisted.
- **Fixed seed.** `20_261_005` makes the property test reproducible; change it only when adding a new case shape.
