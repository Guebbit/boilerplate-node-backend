---
source: src/modules/orders/domain/tax.ts
sha256: eaf49a718efc797ef6d3a1a4f139c246d3f11f17c7eab34166942919b8095f04
generated_at: 2026-09-23T19:02:08.326090+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/tax.ts

## Purpose

Computes the full VAT breakdown (per-line, per-rate, and order-level) for an order using the **frozen** prices and tax rates captured at checkout. It is a pure derivation step at serialization time—tax figures are never persisted and never re-resolved against a product's current tax class, so a later config change cannot restate what a past order was actually charged.

## Key elements

- **`orderTaxBreakdown(order: OrderTaxInput): OrderTaxBreakdown`** — The single public entry point. Takes an order's items and optional frozen shipping cost; returns per-line net/tax/gross, order totals, a per-rate summary (`taxSummary`), and a per-rate shipping-only summary (`shippingByRate`).
- **`extractTax(gross, rate): Money`** — Extracts the VAT portion from a gross amount using the standard `gross × rate / (1 + rate)` formula. Delegates rounding to `scaleMoneyByRate`.
- **`frozenRate(item): number`** — Defensively coerces the raw `product.taxRate` from aggregate output into a usable number, defaulting to `0` for anything non-finite.
- **`foldIntoRate(byRate, rate, net, tax)`** — Accumulates (net, tax) pairs into a per-rate `Map` so goods and shipping shares land in the same row without a second pass.
- **`TaxableLineItem`** — Minimal shape each order line must expose (`quantity`, `product.price`, `product.taxRate`), typed as `unknown` to reflect raw aggregate output.
- **`OrderTaxBreakdown`** — The return type: `lines`, `netTotal`, `taxTotal`, `shippingNetAmount`, `shippingTaxAmount`, `taxSummary`, and `shippingByRate`.

## Relationships

- **`./money.ts`** — All arithmetic (`addMoney`, `subtractMoney`, `scaleMoney`, `scaleMoneyByRate`, `apportion`, `toMinorUnits`, `toDecimalAmount`, `wholeCount`, `NO_MONEY`) is delegated to this module. No floating-point math is performed directly here.
- **`model.ts`** — `applyOrderTax` copies the per-line and order-level figures onto serialized order items, but deliberately **omits** `shippingByRate` from the public contract. The per-rate shipping detail exists for the invoice path only.
- **`emails.ts`** — Consumes `shippingByRate` (and possibly `taxSummary`) to render per-rate shipping rows on the invoice email.
- **`index.ts`** — Re-exports this module's public types and function as part of the domain barrel.
- **`tests/unit/tax.test.ts`** — Unit tests covering the breakdown math, rounding, shipping apportionment, and the zero-shipping filter on `shippingByRate`.

## Notes

- **Shipping has no tax rate of its own.** It is apportioned pro-rata across lines by each line's gross value, then taxed at that line's own frozen rate (ancillary treatment). `shippingByRate` reflects this: each row is keyed by the goods line's rate, not a separate shipping rate.
- **`shippingByRate` is filtered** to drop rows where both `netAmount` and `taxAmount` round to zero (e.g., no shipping cost, or all lines at that rate priced at zero). `taxSummary` has no such filter.
- **`grossAmount` is always computed as `addMoney(net, tax)`** at the point of derivation, never re-derived by a caller from the two already-rounded decimal fields. This avoids drift from floating-point summation.
- **All inputs arrive as `unknown`** (raw aggregate output). The file coerces them defensively (`Number(...)`, `Number.isFinite` check, `toMinorUnits`, `wholeCount`) rather than trusting the upstream pipeline.
- **Rounding** is half-up to the nearest minor unit and happens exclusively inside `money.ts` helpers; this file performs no arithmetic that could introduce unrounded intermediates.
