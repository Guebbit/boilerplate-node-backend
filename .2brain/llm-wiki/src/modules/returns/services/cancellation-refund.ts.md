---
source: src/modules/returns/services/cancellation-refund.ts
sha256: 80acded9ee9a9e5c52af929ca317d1c1524cd1a2978f333b0effeea4ab7eb77b
generated_at: 2026-11-08T08:02:25.353373+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/cancellation-refund.ts

## Purpose

Computes the refund breakdown owed when cancelling a fulfillment order's remainder. It exists as a single shared computation for the two callers that need the same number: the cancel operation itself (inside its transaction) and `GET /returns/options` (which quotes the refund before anything is written).

## Key elements

- **`cancellationRefundOn(order, earlier, lines)`** — The sole export. Takes the `OrderDocument`, the order's already-settled returns (`AccountedReturn[]`), and the product lines this cancel takes (`ProductQuantity[]`). Returns a `RefundBreakdown` by composing four domain helpers: `accountsOf` (sums what earlier returns have settled), `takesLastUnit` (flags whether this cancel consumes the final unit of a product), `shippingStillOwed` (remaining shipping liability), and `cancellationRefundFor` (assembles the final breakdown).

## Relationships

- **`src/modules/orders/index.ts`** — Provides the `OrderDocument` type used as input.
- **`src/modules/returns/domain/index.ts`** — Barrel import source for `accountsOf`, `cancellationRefundFor`, `shippingStillOwed`, `takesLastUnit`, `RefundBreakdown`, `AccountedReturn`, `ProductQuantity`.
- **`src/modules/returns/domain/accounting.ts`** — Supplies `accountsOf` and the `AccountedReturn` type.
- **`src/modules/returns/domain/quantities.ts`** — Supplies `ProductQuantity` and `takesLastUnit`.
- **`src/modules/returns/domain/refund-amount.ts`** — Supplies `cancellationRefundFor`, `shippingStillOwed`, and `RefundBreakdown`.
- **`src/modules/returns/services/cancel-remainder.ts`** — Caller 1: invokes `cancellationRefundOn` inside the cancel transaction.
- **`src/modules/returns/services/options.ts`** — Caller 2: invokes `cancellationRefundOn` to quote the refund on `GET /returns/options` before any write.
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** — Test that exercises this computation indirectly through the delivery/fulfillment flow.

## Notes

- This module is purely computational — it reads order and return state and returns a number; it performs no writes and has no side effects.
- `lines` represents what *this* cancel takes, while `earlier` represents what *previous* returns already settled. Conflating the two is the primary risk when modifying the function.
- `productId` is coerced to `String(item.product._id)` throughout; callers must pass IDs in a form compatible with that map lookup.
