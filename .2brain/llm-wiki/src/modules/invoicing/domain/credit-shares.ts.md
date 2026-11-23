---
source: src/modules/invoicing/domain/credit-shares.ts
source_sha256: 2c3e045655ce1a2403c83e2139934e6628416af32fc0a1d02d18ec5dad81590b
context_sha256: 54dba0670cfc6fdea3780b04bae5286577878cdfae0543711c1d2a026be9ff27
generated_at: 2026-11-22T05:30:26.932638+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/domain/credit-shares.ts

## Purpose
Pure arithmetic for the lines of a credit note that reverses only part of an invoice. It spreads a refunded gross amount across the VAT rates the invoice charged, producing one line per rate. It has no database, model or tax-function dependency, so it can be tested in isolation. VAT is extracted from the resulting lines later by `src/modules/invoicing/services/credit-breakdown.ts`.

## Key elements
- `CreditableInvoice` – plain-data view of the invoice: `currency`, `lines` (with optional `productId`, `unitPrice`, `taxRate`), `shippingByRate`, and `taxSummary` (one row per distinct rate).
- `RefundedGoods` – the goods a refund pays back: `lines` (`productId`, `quantity`) and a decimal `shipping` amount.
- `CreditLine` – output line: `title`, `quantity: 1`, gross `unitPrice` (decimal string), and `taxRate`.
- `creditShares(invoice, amount, lineTitle, goods?)` – the only exported function. It builds weights per `taxSummary` rate, apportions the refund amount by them, and returns a `CreditLine` for each rate whose share is greater than 0.
- `goodsWeights` (private) – computes per-rate weights, in `taxSummary` order, from the returned goods and their delivery:
  - Each returned line is matched by `productId` and weighs `unitPrice × quantity` at that line's `taxRate`.
  - Shipping is apportioned across `shippingByRate` in the invoice's own proportions and added to those rates.

## Relationships
- `src/domain-primitives/money.ts` (imported as `@domain-primitives/money`) supplies `Money`, `NO_MONEY`, `addMoney`, `apportion`, `scaleMoney`, `toMinorUnits` and `toDecimalString`. All amounts are handled in minor units and converted back to decimal strings at the end.
- `src/modules/invoicing/services/credit-breakdown.ts` extracts VAT from the lines this module produces. The module docs name it explicitly.
- Other neighbors (`src/modules/invoicing/services/issue-credit-note.ts`, `src/modules/invoicing/services/figures.ts`, `src/modules/invoicing/domain/index.ts`, `src/modules/invoicing/domain/remainder.ts`) and the tests (`src/modules/invoicing/tests/unit/credit-shares.test.ts`, `src/modules/invoicing/tests/unit/credit-breakdown.test.ts`, `src/modules/delivery/tests/unit/fulfillment.test.ts`) are graph neighbors. The file itself does not show how they use it.

## Notes
- **Goods vs goodwill:** with `goods`, only the matched lines and their delivery are weighted, per VAT Directive Art. 90 (credited at the rate the goods were sold at). Without `goods`, every rate is weighted by its `taxSummary.grossAmount`, which is the pro-rata rule.
- **Fallback:** if the goods match no invoice line and add up to zero weight, it falls back to the pro-rata weights.
- **Refund size:** the weights decide only the split. The shares always sum to the actual refund `amount`, so a deduction or an earlier partial refund shrinks the credit and never inflates it.
- Goods whose `productId` matches no invoice line are silently ignored.
- Lines are emitted only for rates that took a positive share, so the output can have fewer lines than `taxSummary` rows.
- `lineTitle` is used as-is on every line and should already be in the invoice's language.
