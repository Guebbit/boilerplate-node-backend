---
source: src/modules/stats/services/figures.ts
sha256: ecf9553058564f50032b75475902f531612a2c40501e5565ebb24852b4ac4751
generated_at: 2026-10-29T05:56:04.033518+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/services/figures.ts

## Purpose

Pure computation layer that turns raw money-and-count sums (kept in minor units) into the published decimal figures for a single currency bucket. It exists so that summing buckets always equals summing the whole, and so the minor-unit → decimal conversion happens exactly once, at the boundary.

## Key elements

- **`RawFigures`** (interface) — One currency bucket's raw sums: order/unit counts plus invoiced and credited Money (goods, shipping, tax, gross) in minor units.
- **`Figures`** (interface) — The published contract in decimals: orders, units, gross/net sales, shipping, taxes, total, refunds, AOV, etc.
- **`emptyRawFigures()`** — Zero-valued `RawFigures` (all counts 0, all Money `NO_MONEY`).
- **`addRawFigures(a, b)`** — Field-by-field addition of two `RawFigures` using `addMoney` for Money fields and plain `+` for counts.
- **`figuresOf(raw, currency)`** — Derives a `Figures` object from a `RawFigures`, subtracting credited from invoiced, then converting each Money value to a decimal via `toDecimalAmount(…, currency)`. `discounts` is hard-coded to `0` (no discount concept yet). `averageOrderValue` uses `averageMoney(invoicedGoods, orders)`.
- **`rateOf(part, whole)`** — Safe division; returns `0` when `whole` is not positive.

## Relationships

- **`src/domain-primitives/money.ts`** — All Money arithmetic (`addMoney`, `subtractMoney`, `averageMoney`), the `NO_MONEY` sentinel, the `Money` type, and `toDecimalAmount` are imported from this primitive. `figuresOf` depends entirely on these for correct minor-unit handling.
- **`src/modules/stats/services/sales.ts` / `breakdowns.ts`** — The module docstring identifies these as the "owning modules" that produce the raw money and counts handed to `figuresOf` and `addRawFigures`. They are the primary consumers of this file's exports.
- **`src/modules/stats/tests/unit/figures.test.ts`** — Unit tests for every export in this file.

## Notes

- All Money fields in `RawFigures` are **minor units** (e.g. cents, pence). Decimal conversion happens only inside `figuresOf`, using the caller-supplied ISO-4217 `currency` code to pick the right scale.
- `discounts` is always `0` in `Figures`; the subtraction formula for `netSales` accounts for this (gross − reversals, no discount term).
- `averageOrderValue` divides `invoicedGoods` by `orders` via `averageMoney`; if `orders` is 0 the primitive is expected to handle the edge case (see `money.ts`).
- Definitions of terms (sale date, "paid orders only", Shopify vs. WooCommerce naming) live in `docs/modules/stats.md#definitions`, not in this file.
