---
source: tests/unit/domain-primitives/money-average.test.ts
sha256: 0a51f592dd17d5758d82bbf523154b459ecb2403f3f143d3270c88acaee108a7
generated_at: 2026-11-08T10:04:03.083607+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/domain-primitives/money-average.test.ts

## Purpose

Unit tests for the `averageMoney` function, verifying its two contractual behaviors: correct division with half-up rounding to the minor unit, and safe handling of the zero-orders case (returning `NO_MONEY` rather than dividing by zero).

## Key elements

- **`averageMoney`** — imported from `@domain-primitives/money`; divides a total amount by a count of orders.
- **`toMinorUnits(amount, currency)`** — helper that constructs a `Money` value from a decimal amount and ISO currency code.
- **`NO_MONEY`** — sentinel constant representing "no money" / absence of a monetary value.
- **`describe('averageMoney')`** — single test suite containing two test cases:
  - *Even division & half-up rounding* — asserts `10/4 → 2.50`, `10/3 → 3.33`, `0.05/2 → 0.03` (all in EUR).
  - *Zero orders* — asserts `averageMoney(10 EUR, 0)` equals `NO_MONEY`.

## Relationships

- **`src/domain-primitives/money.ts`** — the sole production dependency. All three imported symbols (`averageMoney`, `toMinorUnits`, `NO_MONEY`) originate there. This test file exercises that module's public API in isolation.

## Notes

- The test file is self-contained: it uses `toBe` (structural equality) rather than `toEqual`, implying `Money` values compare by reference/identity via their equality representation.
- Rounding is specified as **half-up** in the test name and demonstrated by the `0.05 / 2 → 0.03` case (the true quotient 0.025 rounds up to 0.03). Any implementation change to banker's rounding or truncation would break this test.
- The zero-orders guard is a domain invariant, not just an edge case: the comment in the source docblock frames it as "no orders is no average, not a division by nothing."
