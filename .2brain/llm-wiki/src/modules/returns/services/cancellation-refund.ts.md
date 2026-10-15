---
source: src/modules/returns/services/cancellation-refund.ts
sha256: 32baedd11a2910b0e366c5355379f1897eca572907d178b76546472c8ffa9729
generated_at: 2026-10-15T11:55:33.426038+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/cancellation-refund.ts

## Purpose

Computes the refund breakdown for cancelling the remainder of a fulfillment order. It exists so that both the cancel transaction (`cancel-remainder`) and the pre-write quote endpoint (`GET /returns/options`) share a single, consistent calculation of what the cancel owes, accounting for what earlier returns and cancels have already settled.

## Key elements

- **`cancellationRefundOn(order, earlier, lines): RefundBreakdown`** — The sole export. Takes the order document, the set of previously accounted returns, and the product lines this cancel takes. Resolves unit prices from the order items, computes shipping still owed, determines whether this cancel takes the last unit of a product, and delegates the arithmetic to `cancellationRefundFor` in the domain layer.
- **Module doc comment** — Explicitly names the two callers (the cancel inside its transaction, and `options.ts` quoting before write) as the reason the function lives here rather than inline.

## Relationships

- **`src/modules/returns/domain/index.ts`** — Re-exported source for `accountsOf`, `cancellationRefundFor`, `shippingStillOwed`, `takesLastUnit`, and the types `AccountedReturn`, `ProductQuantity`, `RefundBreakdown`. This file does all orchestration; the domain performs the math.
- **`src/modules/returns/domain/accounting.ts`** — Likely home of `accountsOf` (sums settled amounts from prior returns) and `AccountedReturn`.
- **`src/modules/returns/domain/refund-amount.ts`** — Likely home of `cancellationRefundFor` and `RefundBreakdown`.
- **`src/modules/returns/domain/quantities.ts`** — Likely home of `ProductQuantity` and `takesLastUnit`.
- **`src/modules/returns/services/cancel-remainder.ts`** — Caller 1: invokes `cancellationRefundOn` inside its transaction to record the refund.
- **`src/modules/returns/services/options.ts`** — Caller 2: invokes `cancellationRefundOn` to quote the amount before any write.
- **`src/modules/orders/index.ts`** / **`src/modules/orders/model.ts`** — Provides the `OrderDocument` type (order items, currency, shipping cost).
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** — Test coverage that exercises this calculation indirectly through the cancel path.

## Notes

- The function is **pure/read-only** at this layer: it does not open a transaction or write. The transaction boundary lives in `cancel-remainder.ts`.
- `price.get(productId) ?? 0` silently coerces a missing price to zero rather than throwing — relevant if order items and the `lines` array ever disagree on product IDs.
- The module deliberately exposes exactly one function so the two callers cannot drift apart in how they assemble inputs.
