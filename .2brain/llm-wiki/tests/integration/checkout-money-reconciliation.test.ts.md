---
source: tests/integration/checkout-money-reconciliation.test.ts
sha256: a8fac184a5464f56e419683c0395a29e912658086993f43fae41a3f42e8edfb3
generated_at: 2026-10-15T12:44:19.070979+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/checkout-money-reconciliation.test.ts

## Purpose

Integration test that drives a basket through three real HTTP endpoints — `GET /cart`, `POST /cart/checkout`, and `POST /payments/intent` — and asserts all three report the same monetary amount, to the last minor unit. It targets the edges pure composition tests cannot reach over HTTP: sub-cent prices, free-shipping boundary crossings, and currencies with no minor unit (JPY). The expected amount is always computed by an independent integer-minor-unit oracle, never by calling the system under test.

## Key elements

- **`SHIPPING`** — constant table of the three shipping methods (`standard`, `express`, `pickup`) with their flat cost and free-above threshold, mirroring `delivery/domain/rates.ts`.
- **`expectedMinor(lines, method, exponent)`** — the independent oracle: rounds each line to minor units, multiplies by quantity, adds flat shipping if the decimal line total is below the free-above threshold. Returns integer minor units.
- **`expectedPrices(lines, method, exponent)`** — wraps `expectedMinor` to produce the full expected breakdown (`total`, `itemsTotal`, `shippingCost`) in major units, so a wrong `totalPrice` cannot hide behind a correct one.
- **`priceThroughHttp(shopper, lines, method)`** — creates products, adds items to the cart, selects a shipping method, then reads `GET /cart`, calls `checkoutAs`, and calls `POST /payments/intent`. Cancels the resulting order before returning so the next basket can reuse the same shopper.
- **`expectReconciled(prices, expected)`** — shared assertion that all three doors agree on total, and that the cart's `itemsTotal` and `shippingCost` match independently.
- **`EUR_CASES`** — eight hand-picked edge-case baskets (sub-cent prices, float drift, free-shipping boundary, zero-price items, multi-line mixed shipping).
- **`describe` blocks** — one for EUR (table-driven cases + `fast-check` property with up to 3 lines), one for JPY (whole-yen and fractional-yen baskets under `NODE_DEFAULT_CURRENCY=JPY`).

## Relationships

- **`tests/support/http.ts`** — provides `api` (supertest wrapper) and `authenticateAs` used for every HTTP call.
- **`tests/support/checkout-as.ts`** — provides `checkoutAs`, which POSTs to `/cart/checkout` and returns the created order.
- **`tests/support/environment.ts`** — provides `withEnvironment`, used to switch `NODE_DEFAULT_CURRENCY` to `JPY` for the JPY suite.
- **`tests/support/knobs.ts`** — provides `PROPERTY_RUNS_WITH_DATABASE`, the run-count for the property-based test.
- **`tests/support/setup-test-db.ts`** — called once at module top to seed the in-memory test database.
- **`src/modules/addresses/tests/factories.ts`** — provides `giveAddress`, which creates a default shipping address for a user so checkout can proceed.
- **`src/modules/products/tests/factories.ts`** — provides `createProduct`, used to create catalogue items with a specific decimal price before adding them to the cart.

## Notes

- **Order cancellation is mandatory per basket.** The shop enforces `CART_OPEN_ORDER_LIMIT` on open orders per shopper; `priceThroughHttp` cancels the order before returning so the next iteration can reuse the same authenticated user.
- **Free-shipping threshold is compared against the decimal line total** (`linesMinor / scale >= freeAbove`), not the minor-unit integer. The oracle and the system under test must both use this comparison.
- **Property test uses a fixed seed (`20_261_005`) and `endOnFailure: true`**, so a failure is reproducible but the suite stops at the first bad basket.
- **JPY exponent is 0** — the oracle scales by `10 ** 0 = 1`, meaning no rounding to cents; a fractional yen like 99.5 is rounded per-unit to 100.
- **`expectedPrices` derives `shippingCost` as the difference between the chosen-method total and the `pickup` total** (pickup has flat = 0), rather than re-computing the shipping rule independently.
