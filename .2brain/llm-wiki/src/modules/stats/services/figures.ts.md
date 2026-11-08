---
source: src/modules/stats/services/figures.ts
sha256: 24ada564c539d7022117b41cd64c3eb7d2fe2fb9f74976d9e90bd43d7907fae8
generated_at: 2026-11-08T08:25:31.232507+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/services/figures.ts

## Purpose

Pure derivation layer that turns raw per-bucket money counts (in minor units) into the decimal-string `Figures` contract published to consumers. It exists so that bucket-level sums always reconcile with the grand total: all arithmetic stays in integer minor units until the final string formatting step.

## Key elements

- **`RawFigures`** (interface) — one bucket's totals in minor-unit `Money`: order/unit counts plus invoiced and credited goods/shipping/tax/gross.
- **`Figures`** (interface) — the published contract; all monetary values are decimal strings.
- **`emptyRawFigures()`** — identity element (all zeros / `NO_MONEY`) for use as an accumulator seed.
- **`addRawFigures(a, b)`** — field-by-field addition of two `RawFigures`; uses `addMoney` for monetary fields.
- **`figuresOf(raw, currency)`** — derives `Figures` from `RawFigures`; computes net sales, shipping, taxes, total sales, and average order value, then formats via `toDecimalString`.
- **`rateOf(part, whole)`** — safe division returning `part / whole`, or `0` when `whole` is `≤ 0`.

## Relationships

- **`src/domain-primitives/money.ts`** — imports `Money`, `NO_MONEY`, `addMoney`, `subtractMoney`, `averageMoney`, and `toDecimalString`; all monetary math in this file delegates to those primitives.
- **`src/modules/stats/services/sales.ts`** / **`src/modules/stats/services/breakdowns.ts`** — upstream consumers that accumulate `RawFigures` (via `emptyRawFigures` / `addRawFigures`) and then call `figuresOf` to produce the published figures.
- **`src/modules/stats/tests/unit/figures.test.ts`** — unit tests covering the arithmetic and edge cases of the functions above.

## Notes

- `discounts` is always `NO_MONEY`; the code comment explicitly states "no discount exists yet," so it is a placeholder, not a bug.
- `averageOrderValue` is **gross** ÷ order count, not net ÷ orders.
- The `currency` ISO-4217 code is the sole input that affects output formatting (decimal places); it is not used in any arithmetic.
- The invariant "sum of buckets equals sum of the whole" depends on all accumulation happening in minor units before `toDecimalString` is ever called.
