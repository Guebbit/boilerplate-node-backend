---
source: src/modules/orders/domain/tax.ts
sha256: 0b465bd1257f205fd923cd698444e270876c2a113bcfc224cc54e58f046ec570
generated_at: 2026-09-27T15:09:42.724325+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/tax.ts

## Purpose

Computes all VAT figures for an order—per-line net/tax/gross, order-level totals, per-rate summaries, and shipping's own per-rate slice—by extracting tax from each line's **frozen** gross price at serialization time. A config rate change never restates a past order. Also apportions a frozen shipping cost pro-rata across lines and taxes it at each line's own rate (shipping is ancillary, not independently rated).

## Key elements

- **`orderTaxBreakdown(order: OrderTaxInput): OrderTaxBreakdown`** — the sole public function; derives the full breakdown in one pass over `items`.
- **`OrderTaxBreakdown`** — return shape: `lines[]`, `netTotal`, `taxTotal`, `shippingNetAmount`, `shippingTaxAmount`, `taxSummary[]`, `shippingByRate[]`.
- **`TaxRateSummary`** / **`LineTaxBreakdown`** — per-rate and per-line row shapes (all amounts are decimal `number`s).
- **`TaxableLineItem`** / **`OrderTaxInput`** — input shapes; fields are `unknown` because they arrive as raw aggregate output.
- **`extractTax(gross, rate)`** (private) — applies `gross × rate / (1 + rate)` via `scaleMoneyByRate`; returns `NO_MONEY` for rate ≤ 0.
- **`frozenRate(item)`** (private) — coerces `item.product?.taxRate` to a finite number, defaulting to 0.
- **`foldIntoRate(byRate, rate, net, tax)`** (private) — accumulates a (net, tax) pair into a `Map<rate, {net, tax}>` in place.

## Relationships

- **`money.ts`** — all arithmetic (add/subtract/scale/apportion) and the `Money` brand come from here; `NO_MONEY` is the zero sentinel.
- **`rules.ts`** — `isShippedItem` gates which lines receive a shipping apportionment weight (digital lines get `NO_MONEY` weight).
- **`model.ts`** — `applyOrderTax` copies `OrderTaxBreakdown` (minus `shippingByRate`) onto serialized order items for the API response.
- **`emails.ts`** — the invoice email reads `shippingByRate` directly from the breakdown to print per-rate shipping rows.
- **`index.ts`** — barrel re-export of this module's public API.
- **`tax.test.ts`** — unit tests covering the breakdown logic, apportionment, and edge cases.

## Notes

- Prices are **always gross** (VAT-inclusive). Tax is *extracted*, never added on top.
- `grossAmount` in both `LineTaxBreakdown` and `TaxRateSummary` is computed from **unrounded** `Money` values before either operand is converted to a decimal—do not re-derive it by summing the two rounded fields.
- `shippingByRate` is **not** part of the public API contract (`model.ts` does not serialize it); it exists solely for the invoice email.
- `shippingByRate` filters out any rate row where both `netAmount` and `taxAmount` are zero (e.g. no shipping cost, or all lines at that rate priced at zero).
- Shipping has **no rate of its own**; it is taxed at each line's frozen rate via pro-rata apportionment by gross value.
