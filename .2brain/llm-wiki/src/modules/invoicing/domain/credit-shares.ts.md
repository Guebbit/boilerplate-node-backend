---
source: src/modules/invoicing/domain/credit-shares.ts
sha256: 7a9b9ef9b869ba3da2b1cfd8068f15fb00e3160154fa0fcbc12397d591a6d6cd
generated_at: 2026-10-15T10:37:54.997814+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/domain/credit-shares.ts

## Purpose

Pure arithmetic that splits a **partial** credit-note refund across the VAT rates of the original invoice, producing one credit line per rate. It distinguishes two refund modes — goods-specific (weighs only the returned lines plus delivery) and goodwill (pro-rata by gross amount) — so the downstream tax extraction mirrors what the invoice itself did.

## Key elements

- **`CreditableInvoice`** — plain-data snapshot of the invoice (lines with `productId`, `unitPrice`, `taxRate`; `shippingByRate`; `taxSummary`). Decouples this domain layer from any invoice model.
- **`RefundedGoods`** — describes what the refund pays back: matched product lines with quantities and a decimal shipping amount.
- **`CreditLine`** — one output row of the credit note (`title`, `quantity: 1`, gross `unitPrice`, `taxRate`).
- **`creditShares`** *(exported)* — the main entry point. Accepts invoice data, a gross decimal amount, a line title, and optional `RefundedGoods`; returns an array of `CreditLine`s (one per rate that received a non-zero share).
- **`goodsWeights`** *(internal)* — computes per-rate weights in minor units by matching returned product IDs to invoice lines and apportioning delivery via the invoice's own `shippingByRate` proportions.

## Relationships

- **Imports** `addMoney`, `apportion`, `scaleMoney`, `toDecimalAmount`, `toMinorUnits`, `NO_MONEY`, `Money` from [`@shared-kernel/money`](../../shared-kernel/money.ts) — all currency arithmetic lives there.
- **Re-exported** through [`domain/index.ts`](index.ts) so services can import from the domain barrel.
- **Consumed by** [`services/credit-breakdown.ts`](../services/credit-breakdown.ts), which takes the `CreditLine[]` output and extracts the VAT portion per rate.
- **Consumed by** [`services/issue-credit-note.ts`](../services/issue-credit-note.ts), which orchestrates the full credit-note write using `creditShares` for the line split.
- **Tested by** [`tests/unit/credit-shares.test.ts`](../tests/unit/credit-shares.test.ts) and referenced in [`tests/unit/credit-breakdown.test.ts`](../tests/unit/credit-breakdown.test.ts).
- **Cross-module reference** in [`delivery/tests/unit/fulfillment.test.ts`](../../delivery/tests/unit/fulfillment.test.ts) (delivery-side tests that exercise the split via the invoicing domain).

## Notes

- **Pure by design** — no database, no ORM model, no tax-function import. The doc block explicitly states this so the arithmetic stays unit-testable in isolation.
- **Fallback guard:** if `goods` is provided but no product ID matches any invoice line, `goodsWeights` returns all-zero weights; `creditShares` detects this (`addMoney(...) === NO_MONEY`) and silently falls back to the pro-rata rule. No error is thrown.
- **Delivery split is authoritative on the invoice side:** `shippingByRate` on `CreditableInvoice` already encodes how the invoice apportioned delivery across rates; this file re-apportions the *refund's* shipping using those same proportions rather than recalculating.
- `quantity` is always the literal `1`; the entire value lives in `unitPrice`. Consumers should not expect multi-unit lines.
