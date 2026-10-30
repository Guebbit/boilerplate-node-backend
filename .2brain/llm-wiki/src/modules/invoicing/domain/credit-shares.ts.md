---
source: src/modules/invoicing/domain/credit-shares.ts
sha256: 1c2b0210573d2e5e0a3fe93a75f98a2c12816f98646abd8a0c28d8302315fff0
generated_at: 2026-10-29T04:10:54.318633+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/domain/credit-shares.ts

## Purpose

Pure arithmetic module that splits a partial refund across an invoice's VAT rates, producing one credit-note line per rate. It isolates the apportionment logic from persistence, models, and the tax-extraction step so the math can be unit-tested in isolation.

## Key elements

- **`creditShares(invoice, amount, lineTitle, goods?)`** — Main export. Takes the refunded gross amount and (optionally) the specific goods it pays back, then returns one `CreditLine` per VAT rate that receives a non-zero share.
- **`goodsWeights(invoice, goods)`** *(private)* — Computes per-rate weights for a goods-based refund: matches each returned product to its invoice line's rate, and apportions the refunded delivery cost across the rates the invoice charged it at.
- **`CreditableInvoice`** — Read-only data shape the split expects (lines, `shippingByRate`, `taxSummary`). Decouples this module from the invoice document/model.
- **`RefundedGoods`** — The refunded lines (`productId` + `quantity`) and the delivery portion, as passed by the `PAYMENT_REFUNDED` event.
- **`CreditLine`** — One output line: `title`, fixed `quantity: 1`, gross `unitPrice`, and `taxRate`.

## Relationships

- **`src/domain-primitives/money.ts`** — Source of all monetary primitives used here: `Money`, `NO_MONEY`, `addMoney`, `apportion`, `scaleMoney`, `toMinorUnits`, `toDecimalAmount`.
- **`src/modules/invoicing/domain/index.ts`** — Barrel file; re-exports `creditShares` and the three interfaces for consumers within the domain layer.
- **`src/modules/invoicing/services/credit-breakdown.ts`** — Downstream consumer: takes the `CreditLine[]` produced here and extracts the VAT from each line to build the tax summary (the same approach the original invoice used).
- **`src/modules/invoicing/services/issue-credit-note.ts`** — Orchestrator that calls `creditShares` and hands the resulting lines to the credit-note document builder.
- **`src/modules/invoicing/tests/unit/credit-shares.test.ts`** — Unit tests exercising `creditShares` directly (goods-based, goodwill, zero-match fallback, mixed-rate scenarios).

## Notes

- **Fallback to pro-rata:** If the refunded goods match *no* invoice line (all weights sum to `NO_MONEY`), the function silently falls back to apportioning by `taxSummary` gross amounts — the same rule as a goodwill refund.
- **Delivery is always rate-split:** Even in a goods refund, the refunded shipping is distributed across rates in the same proportions the invoice charged it (`shippingByRate`), not by the goods' rates.
- **`quantity` is always `1`:** The gross amount lives entirely in `unitPrice`; callers must not multiply.
- **Minor-units internally:** All arithmetic happens in integer minor units via `toMinorUnits`; conversion back to decimal (`toDecimalAmount`) is the last step before returning.
- **Pure / no side effects:** No I/O, no DB access, no tax function call. The VAT extraction is deliberately deferred to `credit-breakdown.ts`.
