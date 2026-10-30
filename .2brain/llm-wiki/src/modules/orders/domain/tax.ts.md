---
source: src/modules/orders/domain/tax.ts
sha256: 324f198b49fb4ae992930cf485c898ad1110dce01f11f7c172b34b16090b706c
generated_at: 2026-10-29T04:40:50.672383+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/tax.ts

## Purpose

Computes all VAT figures for an order from its frozen (already-priced) lines and shipping cost. It derives per-line tax/net, per-rate summaries, and shipping's apportioned tax share at serialization time, guaranteeing that a later config rate change never restates what a past order was actually charged.

## Key elements

- **`TaxableLineItem`** — minimal shape each order line must satisfy (quantity, product price, taxRate, requiresShipping). Uses `unknown`/nullable fields because it reads raw aggregate output.
- **`LineTaxBreakdown`** — per-line `{ taxAmount, netAmount, grossAmount }` in decimal units; `grossAmount` is computed here, not re-derived by callers.
- **`TaxRateSummary`** — one row per distinct VAT rate: `{ rate, netAmount, taxAmount, grossAmount }`.
- **`OrderTaxBreakdown`** — full result: `lines`, `netTotal`, `taxTotal`, `shippingNetAmount`, `shippingTaxAmount`, `taxSummary` (per-rate rows, sorted ascending), and `shippingByRate` (per-rate shipping detail for invoices).
- **`OrderTaxInput`** — input: `items`, optional `shippingCost`, and `currency`.
- **`lineTaxFromRateTotals`** — re-derives per-line tax for an already-issued document given frozen per-rate goods tax totals (no shipping apportionment).
- **`orderTaxBreakdown`** — the main entry point: apportions shipping pro-rata across shipped lines, groups by rate, extracts tax once per rate (EN 16931 BR-CO-17), splits between goods/shipping, and assembles the full breakdown.
- **`extractTax`** (internal) — `gross × rate / (1 + rate)` via `scaleMoneyByRate`; returns `NO_MONEY` for rate ≤ 0.
- **`frozenRate`** (internal) — coerces raw `taxRate` to a finite number, defaulting to 0.
- **`groupByRate`** (internal) — aggregates gross by rate, computes one rounded tax per rate, then apportions it to goods vs shipping.
- **`allocateLineTax`** (internal) — spreads each rate's goods VAT across its lines pro-rata by gross so line taxes sum exactly to the rate's single rounded figure.

## Relationships

- **`src/domain-primitives/money.ts`** — provides all arithmetic (`addMoney`, `subtractMoney`, `scaleMoneyByRate`, `apportion`, `toDecimalAmount`, `toMinorUnits`, `Money`, `NO_MONEY`). Every computation in this file routes through these to guarantee minor-unit exactness.
- **`src/modules/orders/domain/rules.ts`** — supplies `isShippedItem`, which determines whether a line carries a shipping apportionment weight (digital/free-shipping lines get zero weight).
- **`src/modules/orders/domain/totals.ts`** — supplies `lineGross`, the per-line gross (price × quantity) used as the apportionment base.
- **`src/modules/orders/domain/index.ts`** — barrel re-exports this module's public API.
- **`src/modules/orders/model.ts`** — calls `orderTaxBreakdown` (via `applyOrderTax`) to attach frozen tax figures to serialized order items; consumes only the order-level sums, not `shippingByRate`.
- **`src/modules/invoicing/emails.ts`** — reads `shippingByRate` from the breakdown to render per-rate shipping tax rows on invoice emails.
- **`src/modules/invoicing/services/credit-breakdown.ts`** — calls `lineTaxFromRateTotals` to re-derive per-line tax on credit notes from frozen rate totals.
- **`src/modules/orders/tests/unit/tax.test.ts`** — unit tests for the functions above.

## Notes

- **Round-once invariant:** VAT is rounded exactly once per rate (not per line). `apportion` then splits that single figure, so per-line taxes sum exactly to the rate's row. Callers must never re-derive `grossAmount` from the already-rounded `netAmount + taxAmount`.
- **Shipping is ancillary:** it carries no rate of its own; it is apportioned pro-rata by gross value onto the lines that are actually shipped (`isShippedItem`), then taxed at each line's own rate. Digital lines receive zero shipping weight.
- **`shippingByRate` is invoice-only:** it is not copied onto the serialized order model. The order response only carries the aggregate `shippingNetAmount`/`shippingTaxAmount`.
- **`unknown` fields are intentional:** `TaxableLineItem` and `OrderTaxInput.shippingCost` use `unknown` because they arrive as raw aggregate output; all access goes through defensive coercion (`frozenRate`, `toMinorUnits`).
- **Frozen semantics:** rates and prices are never re-resolved against a product's current tax class. A config change must not restate a past order.
