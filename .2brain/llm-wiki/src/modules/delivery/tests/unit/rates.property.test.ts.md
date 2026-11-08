---
source: src/modules/delivery/tests/unit/rates.property.test.ts
sha256: f8af0b12f16913065b31a50416a77c08dd8ee6c177c789c591eaa4413878a0b2
generated_at: 2026-11-08T05:46:43.237109+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/unit/rates.property.test.ts

## Purpose

Property-based tests for the shipping-rate domain (`rates.ts`). Where the companion `rates.test.ts` checks three hand-picked points around the free-shipping threshold, this file asserts the invariants hold for *every* basket value: no NaN/negative output, no charge above the flat rate, correct free/flat behavior at the threshold, and exact weight-range boundaries.

## Key elements

- **`RUN`** — frozen config object: fixed seed (`20_260_902`), run count pulled from `PROPERTY_RUNS`, and `endOnFailure: true` (stop at first counterexample).
- **`itemsTotal()`** — `fast-check` arbitrary producing any non-negative EUR decimal string (0 cents to 1 × 10⁸ cents) via `toDecimalString`.
- **`describe('priceShipping — totality')`** — two properties: (1) result is never NaN and never negative; (2) result ≤ the method's flat rate for all methods × totals.
- **`describe('priceShipping — the free-shipping threshold')`** — three properties: (1) "standard" method returns `"0.00"` at/above its `freeAbove` threshold; (2) returns the flat rate strictly below it; (3) "express" (no threshold) always returns its flat rate.
- **`describe('methodFitsWeight — the declared range holds both ways')`** — property asserting `methodFitsWeight` is true exactly when weight is within `[minWeight, maxWeight]` (treating `undefined` bounds as open), for every method and every weight.

## Relationships

- **`src/modules/delivery/domain/rates.ts`** — the system under test. Imports `findShippingMethod`, `priceShipping`, `methodFitsWeight`, and the `SHIPPING_METHODS` array.
- **`src/domain-primitives/money.ts`** — imports `toDecimalString`, `toMinorUnits`, and the `Money` type to convert between cents and decimal strings in EUR.
- **`tests/support/knobs.ts`** — imports `PROPERTY_RUNS` so the number of property iterations is adjustable project-wide (e.g. bumped for CI, reduced locally).

## Notes

- Seeded (`seed: 20_260_902`); if a counterexample is found, it is deterministic and intended to be transcribed into a fixed-point case in `rates.test.ts` (stated in the file's doc comment).
- `endOnFailure: true` means execution halts on the first failing example rather than collecting multiple — keep the seed stable so the failing input is reproducible.
- The `itemsTotal()` generator caps at 10⁸ cents (≈ €1 000 000) to keep arithmetic sane while still covering "any realistic basket."
- The threshold tests reference the `"standard"` and `"express"` methods by name via `findShippingMethod` with a non-null assertion (`!`); if those identifiers are renamed in the domain, this file breaks at the call site rather than in the domain.
