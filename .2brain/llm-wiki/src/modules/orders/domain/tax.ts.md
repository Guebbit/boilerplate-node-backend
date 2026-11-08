---
source: src/modules/orders/domain/tax.ts
sha256: 74fb783bea1bc4649b1fb22290cca6b9546b79040e113a0817bb29dee7f6e421
generated_at: 2026-11-08T06:50:24.034599+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/tax.ts

## Purpose

Computes VAT arithmetic for an order from each line's **frozen** price, quantity, and tax rate, plus an apportioned shipping share. It exists so that tax figures are derived at serialization time from what was actually charged, never re-resolved against a product's current tax class — a config rate change must not restate a past order. Mirrors `totals.ts`'s approach to `totalPrice`: computed on demand, never stored.

## Key elements

- **`orderTaxBreakdown`** (exported) — Main entry point. Takes `OrderTaxInput` (items, `shippingCost`, `currency`) and returns a full `OrderTaxBreakdown`: per-line figures, order-level totals, a per-rate `taxSummary`, and `shippingByRate` detail.
- **`lineTaxFromRateTotals`** (exported) — Re-derives per-line `LineTaxBreakdown[]` from already-frozen per-rate goods-tax totals (decimal strings). Used by issued documents (invoices, credit notes) that no longer carry per-line shipping.
- **`TaxableLineItem`** — Minimal shape needed from each order item (raw aggregate output, hence `unknown`/`null` types).
- **`OrderTaxBreakdown`** — The return contract: `lines`, `netTotal`, `taxTotal`, `shippingNetAmount`, `shippingTaxAmount`, `taxSummary`, `shippingByRate`.
- **`TaxRateSummary`** — One row per distinct rate in the order (rate, net, tax, gross).
- **`extractTax`** (internal) — Extracts VAT from a gross amount: `gross × rate / (1 + rate)`. Returns `NO_MONEY` for rate ≤ 0.
- **`groupByRate`** (internal) — Sums goods + shipping gross per rate, extracts tax **once** per rate, then splits it between goods and shipping via `apportion`.
- **`allocateLineTax`** (internal) — Spreads each rate's goods tax across its lines pro-rata by gross value so per-line taxes sum exactly to the rate's single rounded figure.
- **`frozenRate`** (internal) — Coerces `product.taxRate` to a finite number; defaults to 0.

## Relationships

- **`src/domain-primitives/money.ts`** — All arithmetic goes through its `Money` type and helpers (`addMoney`, `subtractMoney`, `apportion`, `scaleMoneyByRate`, `toMinorUnits`, `toDecimalString`, `NO_MONEY`). No floating-point math in this file.
- **`src/modules/orders/domain/rules.ts`** — Imports `isShippedItem` to decide which lines carry shipping weight in the apportionment (digital lines get zero weight).
- **`src/modules/orders/domain/totals.ts`** — Imports `lineGross` to obtain each line's gross goods amount from its frozen price × quantity.
- **`src/modules/orders/domain/index.ts`** — Barrel re-export for the orders domain.
- **`src/modules/orders/model.ts`** — Consumes the breakdown via `applyOrderTax`; copies line-level and order-level sums onto the serialized order. Does **not** copy `shippingByRate`.
- **`src/modules/invoicing/emails.ts`** — Reads the full breakdown (including `shippingByRate`) to render per-rate shipping rows in invoice emails.
- **`src/modules/invoicing/services/credit-breakdown.ts`** — Uses the breakdown for credit-note line computation.
- **`src/modules/orders/tests/unit/tax.test.ts`** — Unit tests covering `orderTaxBreakdown` and `lineTaxFromRateTotals`.

## Notes

- **Prices are always gross (VAT-inclusive).** Tax is *extracted*, not added on top. The extraction formula is `gross × rate / (1 + rate)`.
- **One rounding per rate, not per line.** Per EN 16931 BR-CO-17, VAT is computed on the rate's combined taxable total and rounded once. Line-level taxes are then apportioned from that single figure, so they always sum exactly to the rate row.
- **`grossAmount` in `LineTaxBreakdown`** is computed from the unrounded `Money` value before either net or tax is stringified. Callers must not re-derive it as `netAmount + taxAmount` from the already-rounded decimals.
- **`shippingByRate` is not part of the serialized order contract.** `model.ts` only copies the order-level `shippingNetAmount` / `shippingTaxAmount` sums. The per-rate shipping detail is consumed directly by invoicing.
- **`frozenRate` silently defaults to 0** for any non-finite value (missing, `null`, `NaN`). There is no validation or warning — the aggregation pipeline is assumed to populate this field.
- **`TaxableLineItem` fields are `unknown`/`null`-typed** intentionally: they arrive as raw aggregate output and are coerced defensively at the point of use, matching the convention in `totals.ts` and `rules.ts`.
