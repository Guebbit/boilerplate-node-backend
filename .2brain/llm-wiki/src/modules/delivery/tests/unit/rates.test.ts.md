---
source: src/modules/delivery/tests/unit/rates.test.ts
sha256: 2f2124e051f7094432c63c56c37b4b4023c89e8224c3e2779d7706817b086ba0
generated_at: 2026-11-08T05:46:53.004035+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/unit/rates.test.ts

## Purpose

Unit tests for the pure pricing/lookup functions in the delivery rates domain. Because the tested code operates over a static in-memory table with no I/O, this file needs no mocks or database—unlike the service-level tests that live in `tests/integration/`.

## Key elements

- **`SHIPPING_METHODS` table tests** — Two `describe` blocks guard the committed data: every price/threshold must fit JPY, EUR, and KWD minor units (`fitsCurrency`); prices must be ≥ 0; `tracked` and `requiresAddress` must be real booleans; address requirement is true for all methods except `pickup`.
- **`findShippingMethod` tests** — Verifies lookup by ID returns the expected record (`express`) and returns `undefined` for an unoffered ID (`overnight`).
- **`priceShipping` tests** — Flat rate below the free-shipping threshold; zero at/above threshold; flat rate when no threshold exists (`express`); zero for `pickup`.
- **`methodFitsWeight` tests** — No range → any weight passes; over `maxWeight` → rejected; under `minWeight` → rejected. The `minWeight` case constructs a method object inline (no current table entry declares one).
- **`cheapestStandardShipping` tests** — Returns the standard flat rate on small orders; returns `'0.00'` once the standard threshold is met.

## Relationships

- **`src/modules/delivery/domain/rates.ts`** — The module under test. All imports (`cheapestStandardShipping`, `findShippingMethod`, `priceShipping`, `methodFitsWeight`, `SHIPPING_METHODS`) come from here.
- **`src/domain-primitives/money.ts`** — Provides `fitsCurrency`, used to assert that every price and threshold in the table is expressible in the currency's minor unit (guards against a rate like `'5.50'` being charged rounded in a 0-decimal currency such as JPY).

## Notes

- The `minWeight` test deliberately builds its method object inline rather than pulling from `SHIPPING_METHODS`, because no shipped method currently declares a `minWeight`. This keeps the branch covered even if the table is edited.
- Currency cases are JPY (0 dp), EUR (2 dp), KWD (3 dp) to span the minor-unit spectrum.
- The file header explicitly notes that `service.test.ts` is in `tests/integration/` because it needs a real database to prove shipment persistence; the pricing rule itself does not.
