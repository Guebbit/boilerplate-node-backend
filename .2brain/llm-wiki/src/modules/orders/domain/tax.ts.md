---
source: src/modules/orders/domain/tax.ts
sha256: 25968b0f04305ece234827dd6942f21861c8aba5071dfb193db1e2afadb745ab
generated_at: 2026-10-15T11:02:50.807648+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/tax.ts

## Purpose

Derives VAT figures (tax, net, gross) for an order from its **frozen** line prices, quantities, and tax rates at serialization time. The central invariant is that a past order's tax is never re-resolved against a product's current tax class — a config rate change must not restate what was actually charged. Shipping is treated as ancillary to the goods it delivers and is apportioned pro-rata, taxed at each line's own rate.

## Key elements

- **`orderTaxBreakdown(order: OrderTaxInput): OrderTaxBreakdown`** — Primary entry point. Takes an order's items, optional `shippingCost`, and `currency`; returns per-line tax, order-level totals, a per-rate summary (`taxSummary`), and a per-rate shipping breakdown (`shippingByRate`).
- **`lineTaxFromRateTotals(items, currency, goodsTaxByRate): LineTaxBreakdown[]`** — Re-derives per-line tax for an already-issued document (e.g. a credit note) from frozen per-rate goods totals, without re-apportioning shipping.
- **`extractTax(gross, rate)`** (internal) — Extracts VAT from a gross (inclusive) amount via `gross × rate / (1 + rate)`, rounding once through `scaleMoneyByRate`.
- **`frozenRate(item)`** (internal) — Coerces `item.product?.taxRate` to a finite number, defaulting to `0`.
- **`groupByRate(grossByLine, shippingByLine, rates)`** (internal) — Aggregates goods + shipping gross per distinct rate, extracts each rate's VAT **once** (EN 16931 BR-CO-17), then splits the rounded tax between goods and shipping via `apportion`.
- **`allocateLineTax(grossByLine, rates, goodsTaxByRate)`** (internal) — Spreads each rate's goods VAT across its lines pro-rata by gross value, so a rate's lines sum exactly to that rate's single rounded figure.
- **Types:** `TaxableLineItem`, `LineTaxBreakdown`, `TaxRateSummary`, `OrderTaxBreakdown`, `OrderTaxInput` — the public shape of the breakdown and its inputs.

## Relationships

- **`src/shared-kernel/money.ts`** — Provides `Money`, `addMoney`, `subtractMoney`, `apportion`, `scaleMoney`, `scaleMoneyByRate`, `toDecimalAmount`, `toMinorUnits`, `wholeCount`, `NO_MONEY`. All arithmetic in this file routes through these to guarantee minor-unit precision.
- **`src/modules/orders/domain/rules.ts`** — Supplies `isShippedItem`, which determines whether a line carries any shipping weight in the apportionment (digital lines get zero weight).
- **`src/modules/orders/model.ts`** — Consumes the `OrderTaxBreakdown` via `applyOrderTax` to stamp `taxAmount`/`netAmount` onto serialized order items; does **not** copy `grossAmount` or `shippingByRate` onto the serialized order.
- **`src/modules/invoicing/emails.ts`** — Reads `OrderTaxBreakdown` (including `shippingByRate`) directly to render invoice email lines such as "shipping, taxed at 22%: €4.10 net, €0.90 tax."
- **`src/modules/invoicing/services/credit-breakdown.ts`** — Uses `lineTaxFromRateTotals` to re-derive per-line tax for credit-note line items from frozen per-rate totals.
- **`src/modules/orders/domain/index.ts`** — Barrel re-export for the domain module.
- **`src/modules/orders/tests/unit/tax.test.ts`** — Unit tests covering the breakdown logic.

## Notes

- **Rounding discipline:** VAT for a given rate is computed **once** on that rate's combined taxable total (goods + shipping), then split. Per-line taxes are allocations of that single rounded figure, never independently rounded. Re-deriving `gross` as `netAmount + taxAmount` from the two already-decimals would introduce drift; this file always computes `grossAmount` from the `Money` values *before* decimal conversion.
- **Shipping is not its own tax line.** It has no rate of its own; it is apportioned onto lines by gross value and taxed at each line's frozen rate. `shippingByRate` exists solely so an invoice can print it as a visible row.
- **`TaxableLineItem` fields are `unknown`/nullable** because they arrive as raw aggregate output; `frozenRate` and the `toMinorUnits`/`wholeCount` calls are the defensive coercion layer.
- **`shippingByRate` omits rates with zero shipping weight** (absent `shippingCost`, or all lines at that rate priced at zero) rather than emitting an empty row.
- **Not stored, not re-resolved:** the module docblock makes explicit that these figures are derived at serialization time, mirroring how `totals.ts` derives `totalPrice`. A config rate change must not restate a past order.
