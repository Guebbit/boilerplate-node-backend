---
source: src/modules/stats/services/figures.ts
sha256: bae8fb7b893d74f43b89b3253058b3789a3a05bbee0723ed006f470e9990276a
generated_at: 2026-10-15T12:04:07.605881+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/services/figures.ts

## Purpose

Pure data structures and functions that turn raw per-bucket money/count sums into the published sales-figures contract. All arithmetic stays in minor units until `figuresOf` converts to decimals, guaranteeing that the sum of bucket figures equals the sum of the whole.

## Key elements

- **`RawFigures`** (interface) — one bucket, one currency: order/unit counts plus six invoiced and six credited `Money` fields.
- **`Figures`** (interface) — the decimal-denominated values the stats contract exposes (netSales, totalSales, averageOrderValue, etc.).
- **`emptyRawFigures()`** — identity value (all zeros / `NO_MONEY`) for starting an accumulation.
- **`addRawFigures(a, b)`** — field-by-field addition; uses `addMoney` for every `Money` field.
- **`figuresOf(raw, currency)`** — derives `Figures` from `RawFigures`; computes net sales, total sales, and AOV, then converts to decimals via `toDecimalAmount`. `discounts` is hardcoded to `0` (not yet modelled).
- **`rateOf(part, whole)`** — safe division returning 0 when `whole` is 0.

## Relationships

- **`src/shared-kernel/money.ts`** — sole import source. Provides `Money`, `NO_MONEY`, `addMoney`, `subtractMoney`, `averageMoney`, and `toDecimalAmount`. Every money operation in this file goes through those helpers.
- **`src/modules/stats/services/breakdowns.ts`** — consumes this module's exports (`RawFigures`, `emptyRawFigures`, `addRawFigures`, `figuresOf`) to build per-bucket stats.
- **`src/modules/stats/services/sales.ts`** — consumes the same exports for the top-level sales summary.
- **`src/modules/stats/tests/unit/figures.test.ts`** — unit-tests every export in this file.

## Notes

- `discounts` in `Figures` is always `0`; the field exists in the contract but no discount data is sourced yet.
- `figuresOf` takes an ISO-4217 `currency` code solely to drive `toDecimalAmount`'s decimal-place selection; no other logic depends on the code.
- `rateOf` is a general-purpose guard (not specific to figures) and is exported for reuse by neighbours that compute percentages.
- The module is a `@module` (no default export); all public API is named exports.
