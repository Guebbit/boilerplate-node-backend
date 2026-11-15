---
source: src/modules/delivery/tests/unit/rates.test.ts
sha256: 4455198316d3b07a0a4288e46471d4d5fd1869c18f19a1c341d1569032cf922c
generated_at: 2026-11-14T19:55:23.896892+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/unit/rates.test.ts

## Purpose

Unit tests for the pure-function shipping-rates domain (`rates.ts`). Validates pricing rules, method lookup, weight constraints, and the static `SHIPPING_METHODS` table shape without mocks or a database. The file header explicitly contrasts this with `tests/integration/service.test.ts`, which needs a real database to prove persistence — the pricing rule itself does not.

## Key elements

- **`SHIPPING_METHODS` currency-fit suite** — Iterates JPY, EUR, KWD and asserts every `price` and `freeAbove` value passes `fitsCurrency`, catching rates that would round when charged.
- **`SHIPPING_METHODS` table-shape suite** — Asserts non-negative prices, boolean `tracked` and `requiresAddress` flags, and that only `pickup` has `requiresAddress: false`. Acts as a canary for typos in committed data.
- **`findShippingMethod` suite** — Verifies exact-match lookup by id and `undefined` for an id the shop doesn't offer.
- **`priceShipping` suite** — Covers flat rate below threshold, free shipping at/above threshold, no-threshold methods (always flat), and pickup returning `'0.00'`.
- **`methodFitsWeight` suite** — Covers methods with no weight range (always fits), `maxWeight` boundary (express at 5000/5001), and `minWeight` boundary using an inline object (see Notes).
- **`cheapestStandardShipping` suite** — Confirms it returns the standard flat rate on small orders and zero once the threshold is met; pickup is excluded as "collection, not delivery."

## Relationships

- **`src/domain-primitives/money.ts`** — Provides `fitsCurrency`, used in the currency-fit suite to verify every quoted rate and threshold is representable in the currency's minor unit.
- **`src/modules/delivery/domain/rates.ts`** — The unit under test. All five imports (`cheapestStandardShipping`, `findShippingMethod`, `priceShipping`, `methodFitsWeight`, `SHIPPING_METHODS`) come from this module.

## Notes

- The `minWeight` test constructs a synthetic method object inline rather than referencing `SHIPPING_METHODS`, because no shipped method currently declares a `minWeight`. The comment flags this so the rule stays covered even if a future method adds one.
- All monetary values are decimal strings (e.g. `'5.00'`), consistent with the `money` primitive convention.
- The `tracked` and `requiresAddress` shape tests exist because downstream consumers (the door's `awaitingTracking` flag; checkout's shipping rule) would silently receive `undefined` if a flag were accidentally omitted from the table.
