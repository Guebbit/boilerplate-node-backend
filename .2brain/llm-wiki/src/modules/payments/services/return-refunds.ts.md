---
source: src/modules/payments/services/return-refunds.ts
source_sha256: e44cf53ceb6e4cea269b8eeaabebd5d60fdba9b61f7f8e813a4d4dd328c7ef60
context_sha256: 7670b3cf1d1f4e0a9122844765a9e68e3a46d705eb49a80692d0a263cfdd767d
generated_at: 2026-11-22T06:53:23.501402+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/services/return-refunds.ts

## Purpose
The door the `returns` module uses to ask `payments` for a refund. `openReturnRefund` opens the refund record inside the return's own transaction. `sendOpenedRefund` sends it after that transaction commits. The refund record, the provider order and the sweep stay in `refunds.ts`. This file only checks permissions, clamps the amount, and delegates to it.

## Key elements
- **`openReturnRefund(orderId, input, context, session)`**: runs inside the return's transaction. It does the following:
  - Returns `null` for a zero amount.
  - Returns `null` when there is no payment in `REFUNDABLE_PAYMENT_STATUS`, or when nothing is left of it. In both cases it enqueues `payment.return_refund_short` via `announceShort`, with cause `no_payment` or `used_up`.
  - Throws, after `auditForbidden`, when the caller fails `mayReturnMoney`. It also throws when `paidOutside` is set and the caller fails `mayRefundOutside`.
  - Builds a `RefundRequest` with `capAtRemaining: true`, the `returnId`, the lines and the shipping.
  - Calls `openSettledOutside` when `paidOutside` is set, otherwise `openRefund`.
  - Throws if the payment moved under the transaction.
  - Announces a short refund if less than asked was opened.
  - Returns `{ refundId, byHand }`.
- **`OpenedReturnRefund`**: the result type. `refundId` is the record's id. `byHand` is true when the payment was hand-recorded and the refund is not paid outside.
- **`returnRefundState(orderId, returnId)`**: looks up the refund carrying that `returnId`. It returns `'none'` if there is no record, `'settled'` if its status is `succeeded`, and `'open'` otherwise.
- **`sendOpenedRefund(orderId, refundId, context)`**: runs after the commit. It resolves to `'settled'` or `'open'`.
  - A refund that is already `succeeded` and `paidOutside` is announced here with `announceRefund`, so the audit is written after the commit.
  - Otherwise it calls `auditRefundRequested`.
  - A hand-recorded payment goes to `recordOwedByHand` and stays `'open'`.
  - A card payment goes to `attemptKeepingGoing`, falling back to `settledElsewhere`.
  - Errors are logged and left to the payment sweep. The visible part of the file ends inside this handler, so how it resolves after an error is not shown.
- **`mayReturnMoney` / `mayRefundOutside`** (private): the permission checks.
  - `mayReturnMoney` allows the system actor, holders of `receive:Return` or `create:Refund`, and, only for a `cancellation`, the buyer of the order.
  - `mayRefundOutside` allows the system actor or a holder of `create:Refund`.

## Relationships
- **`./refunds`**: the write path. Supplies `openRefund`, `openSettledOutside`, `recordOwedByHand`, `attemptKeepingGoing`, `settledElsewhere`, `auditRefundRequested` and the `RefundRequest` type.
- **`./refund-settlement`**: supplies `remainingOf`, which gives what is left to refund, and `announceRefund`.
- **`../repository`**: the payment is read through `paymentRepository`, passing the session in the transactional path.
- **`../domain`**: `isHandRecorded`, `REFUNDABLE_PAYMENT_STATUS` and the `RefundDue` type.
- **`../events`**: `PAYMENT_RETURN_REFUND_SHORT`.
- **`../model`**: the `PaymentDocument` and `RefundLine` types.
- **`@kernel/outbox`**: `enqueueOutboxEvent` writes the short-refund event in the caller's session.
- **`@kernel/ability`**: `holds` for permission checks.
- **`@infrastructure/observability/forbidden`**: `auditForbidden`.
- **`@infrastructure/adapters/logger`**: logs failed sends.
- **`@domain-primitives/money`**: `toMinorUnits` and `padDecimal`.
- **`returns` module**: per the header comment, it is the caller. `src/modules/returns/services/cancel-remainder.ts` is a graph neighbor that likely uses this door. The visible content does not show its imports.

## Notes
- The refund is opened inside the return's transaction and sent after it commits. The record is therefore durable before any provider call.
- Amounts are clamped to what the payment has left, so an earlier goodwill refund cannot cause an over-refund.
- Recording a refund as `paidOutside` needs `create:Refund`. `receive:Return` alone is not enough.
- Paid-outside refunds are born settled, so the sweep never sends them to the card.
- The paid-outside audit is deliberately written in `sendOpenedRefund`, after the commit. The audit writer takes no session, so a row written inside the transaction would repeat on a retry and survive an abort.
- A buyer can return money only for a `cancellation`, as the order's own user.
