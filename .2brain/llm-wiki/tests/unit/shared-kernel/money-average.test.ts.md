---
source: tests/unit/shared-kernel/money-average.test.ts
sha256: 241a6194eee26f18d782c3cc93a4ae53a55bb47997a4eadca86d46994982eeb0
generated_at: 2026-10-15T13:32:35.554197+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/shared-kernel/money-average.test.ts

## Purpose
Unit tests for `averageMoney`, verifying two contract points: that dividing a total across N orders yields the correct amount rounded half-up to the nearest minor unit, and that dividing by zero orders returns `NO_MONEY` rather than producing an invalid value.

## Key elements
- **`describe('averageMoney')`** — the single test suite in the file.
- **Test: "shares an amount evenly and rounds half-up to the minor unit"** — asserts three division cases (10/4, 10/3, 0.05/2 in EUR) against expected minor-unit results, exercising the half-up rounding path.
- **Test: "is no money over no orders"** — asserts that `averageMoney(anyAmount, 0)` returns `NO_MONEY`.

## Relationships
- **`src/shared-kernel/money.ts`** — the module under test. This file imports `averageMoney` (SUT), `toMinorUnits` (amount constructor), and `NO_MONEY` (sentinel) from it.

## Notes
- The rounding mode is **half-up**, not banker's rounding or truncation (0.05 ÷ 2 = 0.025 → 0.03). Any change to the rounding strategy in `money.ts` will break this test.
- The zero-divisor case is an explicit guard in `averageMoney`, not a floating-point edge case; the test documents that contract so a refactor doesn't silently return `NaN` or `Infinity`.
