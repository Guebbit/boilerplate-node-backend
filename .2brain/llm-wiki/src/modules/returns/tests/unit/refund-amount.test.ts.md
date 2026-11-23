---
source: src/modules/returns/tests/unit/refund-amount.test.ts
source_sha256: 7198a000466120ad5313da698841ac41686dcb9700867f6241cc9a19b06523d7
context_sha256: 9e8f936ca091d7f4afbecedc5709ed5574819a0dc77d2cf461fa6099b0de89e9
generated_at: 2026-11-22T07:39:24.862219+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/tests/unit/refund-amount.test.ts

## Purpose
Unit tests for the pure refund arithmetic of a received return, computed in minor units. Each rule of the Consumer Rights Directive's Art. 13 (delivery refund) and Art. 14 (handling deduction) that the calculation implements has at least one case here.

## Key elements
- `base` — shared `RefundInputs` fixture: EUR, `withdrawal`, two shirts at 30.00 plus a mug at 10.00 (goods 70.00), 15.00 express shipping paid, 5.00 cheapest standard shipping, 0.00 handling deduction, `takesLastUnit: true`.
- `totalOf(inputs)` — helper that calls `refundAmountFor` and returns `breakdown.total`. It throws if the verdict is not `ok`.
- `refundAmountFor — the goods` — the goods refund is the returned lines at the frozen unit price. Decimal sums are exact (3 × 0.10 gives `0.30`).
- `refundAmountFor — the delivery (Art. 13(2))`:
  - No shipping is refunded when the return does not take the last unit.
  - A withdrawal caps shipping at the cheapest standard delivery.
  - The full amount is refunded when it was below the standard cost.
  - Nothing is refunded when standard shipping would have been free.
  - `defective` and `wrong_item` reasons refund all shipping paid.
  - The total is goods plus delivery.
- `refundAmountFor — the handling deduction (Art. 14(2))` — the deduction is subtracted and reported in the breakdown (`goods`, `shipping`, `deduction`, `total`). It may reduce the total to `0.00`, but a larger deduction returns `{ ok: false, reason: 'deduction-too-high' }`.
- `currencies without a hundredth` — JPY totals are whole units (`'2400'`).
- `the delivery still owed` and `shippingStillOwed` — shipping owed is paid minus already refunded, floored at zero and exact. Feeding it into `shippingPaid` caps the shipping refund at the remainder.
- `cancellationRefundFor` — a cancellation refunds only the canceled lines when other units remain. On the cancel that takes the last unit, it adds all shipping still owed, uncapped. Sums are exact.

## Relationships
Tests the exports `refundAmountFor`, `cancellationRefundFor`, `shippingStillOwed` and the `RefundInputs` type from `src/modules/returns/domain/refund-amount.ts`. It imports nothing else, and the tests are pure with no I/O or mocks.

## Notes
- Verdicts are a discriminated union (`ok`). Tests use `verdict.ok && verdict.breakdown.…` to narrow the type inline.
- Amounts are decimal strings (`'15.00'`), and JPY uses no decimals in its output.
- Cancellations never cap shipping, since no goods were delivered. Returns cap it for withdrawals only.
