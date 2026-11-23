---
source: src/modules/stats/domain/figures.ts
source_sha256: b6bec8c418f51fa63ada6b9b7ecbc25478dbbfd81fac5e75b44cd1c3c4063e13
context_sha256: 3ec7270d246f7cdc24d089577c83dcf4bc593c4a8e3333c66e39161ab14342a7
generated_at: 2026-11-22T07:50:47.965847+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/stats/domain/figures.ts

## Purpose
Pure domain logic that turns summed money and counts (supplied by the owning modules) into the sales figures the stats contract publishes. Everything stays in minor units until the final step, so the sum of bucket figures equals the figure of the whole. Definitions follow Shopify's names, with the sale date and "paid orders only" taken from WooCommerce (see `src/modules/stats/module.ts`).

## Key elements
- `RawFigures` — per-bucket, per-currency sums: `orders`, `unitsOrdered`, `unitsReversed`, plus invoiced and credited `Money` for goods, shipping, tax and gross.
- `Figures` — the published shape: counts (`orders`, `unitsOrdered`, `unitsReversed`, `netUnits`) and decimal strings (`grossSales`, `discounts`, `reversals`, `netSales`, `shipping`, `taxes`, `totalSales`, `refunds`, `averageOrderValue`).
- `emptyRawFigures()` — zeroed `RawFigures` (money fields are `NO_MONEY`).
- `addRawFigures(a, b)` — field-by-field sum of two `RawFigures`, used to combine buckets.
- `figuresOf(raw, currency)` — derives `Figures`:
  - `grossSales` = invoiced goods; `reversals` = credited goods
  - `netSales` = invoiced goods − credited goods
  - `shipping` and `taxes` = invoiced minus credited
  - `totalSales` = net sales + shipping + taxes
  - `refunds` = credited gross
  - `netUnits` = units ordered − units reversed
  - `averageOrderValue` = invoiced goods averaged over `orders`
- `rateOf(part, whole)` — `part / whole`, or 0 when `whole` is not positive.

## Relationships
- `@domain-primitives/money` (`src/domain-primitives/money.ts`): supplies `Money`, `NO_MONEY`, `addMoney`, `subtractMoney`, `averageMoney` and `toDecimalString`. All arithmetic and decimal formatting is delegated to it.
- `src/modules/stats/domain/index.ts`: the domain entry point for the stats module, listed as a neighbor of this file.
- `src/modules/stats/services/sales.ts` and `breakdowns.ts`: service-layer neighbors that consume these figures.
- `src/modules/stats/tests/unit/figures.test.ts`: the unit tests for this file.

## Notes
- `discounts` is always `"0"`-valued (formatted `NO_MONEY`) because no discount exists yet; net sales is therefore gross minus reversals.
- Only `figuresOf` converts to decimals, and the `currency` argument (ISO-4217) decides the decimal places. Add and aggregate `RawFigures` first, then call `figuresOf` once. Do not sum `Figures` values.
- `averageOrderValue` uses invoiced goods (gross), not net, and is divided by the order count via `averageMoney`. Zero-order handling lives in `averageMoney`, not here.
- `rateOf` is the only plain-number (non-money) helper and guards against an empty denominator.
