---
source: src/modules/invoicing/domain/credit-shares.ts
sha256: 85e76055eb4df8cb76b19140ad0b6fd0a2c5164fead87764a8985189f98d3d4a
generated_at: 2026-11-08T06:10:19.436277+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/domain/credit-shares.ts

## Purpose

Pure domain logic that splits a partial refund across an invoice's distinct VAT rates, producing one credit-note line per rate. It exists so the apportionment arithmetic can be tested and reused without a database, ORM model, or tax-calculation dependency.

## Key elements

- **`CreditableInvoice`** (interface) — plain-data view of the parts of an invoice the split needs: currency, lines (with `productId`, `unitPrice`, `taxRate`), `shippingByRate`, and `taxSummary`.
- **`RefundedGoods`** (interface) — the specific goods and delivery portion a refund pays back; absent for goodwill refunds.
- **`CreditLine`** (interface) — a single credit-note line: `title`, `quantity: 1`, gross `unitPrice` (decimal string), and `taxRate`.
- **`creditShares`** (exported function) — main entry point. Takes an invoice, a refunded decimal amount, a line title, and optional goods. Returns one `CreditLine` per rate that received a non-zero share.
- **`goodsWeights`** (module-private) — computes per-rate weights in minor units for a goods-specific refund: matches returned product lines to their rate, apportions the refunded shipping across `shippingByRate`, and sums per rate.

## Relationships

- **`src/domain-primitives/money.ts`** — sole source of money primitives (`addMoney`, `apportion`, `scaleMoney`, `toDecimalString`, `toMinorUnits`, `NO_MONEY`, `Money`). All arithmetic is delegated here.
- **`src/modules/invoicing/domain/index.ts`** — barrel file that re-exports the public API of this module for consumers.
- **`src/modules/invoicing/services/issue-credit-note.ts`** — caller that invokes `creditShares` to build the line items of a partial credit note, then persists the document.
- **`src/modules/invoicing/services/credit-breakdown.ts`** — downstream consumer: after `creditShares` produces lines at their gross amounts, this service extracts VAT from them (the same way the original invoice did).
- **`src/modules/invoicing/tests/unit/credit-shares.test.ts`** — unit tests exercising `creditShares` and the goods-vs-goodweighting logic in isolation.
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** — verifies that delivery amounts surfaced through `CreditableInvoice.shippingByRate` are consistent with the fulfillment module's own calculations.

## Notes

- **Two weighting modes.** When `goods` is provided the split is proportional to the specific lines + shipping returned (VAT Directive Art. 90). When `goods` is omitted (or no line matches), it falls back to a pro-rata split weighted by each rate's gross amount in `taxSummary`.
- **Fallback path.** If goods are supplied but none match an invoice line, `goodsWeights` returns all-zero weights; `creditShares` detects this (`addMoney(...weighted) === NO_MONEY`) and silently switches to the pro-rata path.
- **Zero-share lines are dropped.** `flatMap` filters out rates whose share is `0`, so the returned array may be shorter than `taxSummary`.
- **All monetary values are decimal strings** (e.g. `"12.50"`) until converted internally to minor units via `toMinorUnits`. Consumers must not parse these as `number`.
- **`quantity` is always `1`** on every `CreditLine`; the split is expressed entirely through `unitPrice`.
