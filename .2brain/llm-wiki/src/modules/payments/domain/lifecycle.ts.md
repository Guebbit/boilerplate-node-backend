---
source: src/modules/payments/domain/lifecycle.ts
generated_at: 2026-11-22T06:44:25.391827+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/domain/lifecycle.ts

## Purpose
Defines the payment and refund lifecycle rules as pure domain code. It declares which payment statuses each kind of write may run *from*. Every set is an array, so it works both as a membership test and as the `$in` of a conditional write (`repository.ts`'s `updateStatusIfIn`/`upsertConfirmable`). Membership in a set is the guard. The file only answers "may I still move this payment", never "to what"; `settlePayment` (in `src/modules/payments/services/settlement.ts`) decides the destination.

## Key elements
**Payment status sets**
- `CONFIRMABLE_PAYMENT_STATUSES`: `requires_confirmation`, `declined`. These are the statuses `confirmPayment` may run from.
- `IN_FLIGHT_PAYMENT_STATUSES`: `requires_action`, `processing`. The next step is `sync`.
- `SETTLEABLE_PAYMENT_STATUSES`: every non-terminal status. `succeeded` and `canceled` are absent, which makes settlement at-most-once.
- `SUCCESS_SETTLEABLE_PAYMENT_STATUSES`: the settleable statuses plus `canceled`, so money landing on a canceled intent is still recorded. It is used by the success write, the amount-mismatch write and the provider re-read gate.
- `REAPABLE_PAYMENT_STATUSES`: the statuses the retention reaper may delete. It is an allow-list of attempts that never became money.
- `REFUNDABLE_PAYMENT_STATUS`: `'succeeded'`.

**Hand-recorded payments**
- `MANUAL_PROVIDER` (`'manual'`), `isHandRecorded(payment)`: payments with no PSP behind them.
- `isOpenTransfer(payment)`: a hand-recorded bank transfer in `requires_action` that has a `transferReference`. It still counts as payable.

**Refund rules**
- `OPEN_REFUND_STATUSES` (`pending`, `failed`) and `isOpenRefund`. A `failed` refund with failure reason `canceled` (staff-canceled) counts as closed.
- `FINAL_REFUND_FAILURES`: `declined`, `expired_or_canceled_card`, `lost_or_stolen_card`, `provider_removed`, `disputed`. `isFinalFailure(reason)` tests membership.
- `UNCLEAR_REFUND_FAILURES`: `provider_unavailable`, `unknown`. The money may have moved.
- `MONEY_DID_NOT_MOVE_FAILURES`: the final failures minus `disputed`, plus `insufficient_funds`. Staff may report such a refund returned by hand.
- `isReversed(refund)`: true when `reversedAt` is set.
- `owesBuyerAnotherWay(refund)`: the refund is open, is not `disputed`, and is either reversed or failed with a final reason.
- `exceedsBy(payment, refund)`: returns a `Money` value, the amount by which an unsent refund overshoots what was paid. It counts every other record whose money may have moved.
- `exceedsRemaining(payment, refund)`: true when the refund is open, was never sent and `exceedsBy` is above 0. Such a record is held unsent for staff to decide.
- Interfaces `RefundFacts` and `RefundablePayment` (extends `DisputablePayment`) describe the slice of the records these rules read.
- The file also documents a rule for when an operator may report a refund returned by hand. Its implementation is past the visible part of the file and is not described here.

## Relationships
- Uses `src/domain-primitives/money.ts` (`addMoney`, `subtractMoney`, `toMinorUnits`, `Money`) for the refund overshoot arithmetic.
- Imports `DAY_MS` and `MINUTE_MS` from `src/domain-primitives/time.ts`. Their use falls in the part of the file not shown here.
- Imports `hasOpenDispute` and `DisputablePayment` from `src/modules/payments/domain/disputes.ts`. `RefundablePayment` extends `DisputablePayment`.
- Takes the `PaymentStatus`, `RefundStatus`, `RefundFailureReason` and `RefundDueRule` types and enums from `@types`.
- Its sets feed the conditional writes in `src/modules/payments/repository.ts` and the settlement flow. The `@module` doc names `services/settlement.ts`, which is not in the neighbor list.
- The other neighbors (`display-status.ts`, `dispute-end.ts`, `index.ts`, `presenter.ts`, the `services/*` files including `refund-settlement.ts`, and the fake in `scenarios/support/doubles/payments/fake.ts`) are graph neighbors. The visible code does not show how they use this file.

## Notes
- Because membership is the guard, adding a status to a set changes which writes can land. `succeeded` and `canceled` are left out of `SETTLEABLE_PAYMENT_STATUSES` on purpose, so webhook retries cannot reopen or re-settle a payment.
- `REAPABLE_PAYMENT_STATUSES` is currently the same list as `SUCCESS_SETTLEABLE_PAYMENT_STATUSES`, but it is kept separate as an allow-list so new money statuses are never reaped by default.
- `FINAL_REFUND_FAILURES` and `MONEY_DID_NOT_MOVE_FAILURES` are different sets. `insufficient_funds` is retried but proves nothing moved, and `disputed` is final but does not prove the money stayed put.
- Unclear failures (`provider_unavailable`, `unknown`) are never treated as proof that money did not move, since settling on them could pay the buyer twice.
- A staff-canceled refund has status `failed` with reason `canceled`. `isOpenRefund` treats it as closed.
- `mayHaveMoved` is private. It treats a refund as moved when it is not reversed and either `succeeded` or holds a `providerRefundRef`.
