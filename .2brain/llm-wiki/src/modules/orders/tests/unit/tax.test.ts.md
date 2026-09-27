---
source: src/modules/orders/tests/unit/tax.test.ts
sha256: 74aa681b1fa4700cf2855e87588b5eff7d8bff4f2af2705983dfe3114e7223ad
generated_at: 2026-09-27T15:22:45.004339+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/tax.test.ts

## Purpose

Unit tests for `orderTaxBreakdown`, the pure VAT-arithmetic function that computes per-line net/tax/gross amounts, order-level totals, shipping apportionment, and a per-rate tax summary. The file pins the rounding, apportionment, and reconstruction invariants that the domain implementation must satisfy.

## Key elements

- **`line(price, quantity, taxRate)`** – factory returning a `TaxableLineItem` fixture for a physical (shippable) line.
- **`digitalLine(price, quantity, taxRate)`** – same shape but sets `requiresShipping: false`, modelling a digital product that must never absorb shipping.
- **`describe` blocks** (one per behavioural concern):
  - *Empty order* – all totals zero, arrays empty.
  - *Fully-VAT order* – VAT extracted from gross line total (price × qty), not unit price; zero-rate case; order-level sum of lines; net + tax reconstructs gross to the cent; non-negativity guard.
  - *Shipping apportionment* – shipping tax added on top of line tax; line `taxAmount`/`netAmount` unchanged; pro-rata split by line value, each half taxed at **its own** rate; `shippingCost: 0` ≡ undefined; physical-only absorption of shipping when a digital line is present; digital-only order carries no shipping.
  - *`shippingNetAmount` / `shippingTaxAmount`* – zero when no shipping; `shippingByRate` rows sum to those totals; net + tax reconstructs shipping gross.
  - *`taxSummary`* – one row per distinct rate, sorted ascending; same-rate lines merge; shipping's share folds into the matching rate row; each row's gross = net + tax; rows reconcile to order totals.

## Relationships

- **`src/modules/orders/domain/tax.ts`** – the sole subject under test. The file imports the `orderTaxBreakdown` function and the `TaxableLineItem` type; no other imports are used.

## Notes

- A comment references `money.ts` as the authority on float-imprecise rounding; exact cent values in assertions (e.g. 359, 333) are hand-computed against that convention.
- Per-line rounding is **not** linear in quantity (rounding once per line, not per unit) — the `10 × 2 @ 20%` case exists specifically to lock this in.
- The `E16(1)` comment marks the digital-line exclusion from shipping as a regression guard for a known prior bug.
- The file is truncated in this snapshot; additional `taxSummary` reconciliation tests continue past the visible cutoff.
