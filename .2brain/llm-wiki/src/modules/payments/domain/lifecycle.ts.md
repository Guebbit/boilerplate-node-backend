---
source: src/modules/payments/domain/lifecycle.ts
sha256: ce0e557fb70ed760cd6c65c0a9ef66610bcfe6bcb49b1c534635a92efd340512
generated_at: 2026-11-08T07:20:20.626465+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/domain/lifecycle.ts

## Purpose

Defines the status sets and guard predicates that control which payment and refund transitions are legal. Every exported array is read both as a membership test and as the `$in` operand of the conditional writes in `repository.ts` (`updateStatusIfIn` / `upsertConfirmable`), so the sets *are* the concurrency guard. There is no explicit from→to graph: all transitions funnel through `settlePayment`, which decides the landing status; these sets only answer "may I still move this payment/refund."

## Key elements

- **`CONFIRMABLE_PAYMENT_STATUSES`** – statuses `confirmPayment` may run from (`requires_confirmation`, `declined`).
- **`IN_FLIGHT_PAYMENT_STATUSES`** – statuses indicating the provider is still deciding (`requires_action`, `processing`).
- **`SETTLEABLE_PAYMENT_STATUSES`** – every non-terminal status a settlement write may move a payment away from; what makes `settlePayment` at-most-once.
- **`SUCCESS_SETTLEABLE_PAYMENT_STATUSES`** – settleable plus `canceled`; the success write (and amount-mismatch / provider re-read gate) uses this wider set.
- **`REAPABLE_PAYMENT_STATUSES`** – allow-list of statuses the retention reaper may delete; new money statuses are never reaped by default.
- **`MANUAL_PROVIDER` / `isHandRecorded`** – identifies operator-recorded payments with no PSP behind them.
- **`isOpenTransfer`** – a hand-recorded `requires_action` payment carrying a `transferReference` (bank transfer still awaiting funds).
- **`REFUNDABLE_PAYMENT_STATUS`** – the single status money can come back from (`succeeded`).
- **`OPEN_REFUND_STATUSES` / `isOpenRefund`** – whether a refund record is still actionable (excludes staff-canceled).
- **`FINAL_REFUND_FAILURES` / `isFinalFailure`** – refusals that end retrying (declined, card issues, provider removed, disputed).
- **`UNCLEAR_REFUND_FAILURES`** – refusals where the provider never answered; the refund may have gone through.
- **`MONEY_DID_NOT_MOVE_FAILURES`** – subset of final failures (minus `disputed`, plus `insufficient_funds`) after which an operator may report the money returned by hand.
- **`owesBuyerAnotherWay`** – whether the buyer is owed the money via a different channel and must be contacted.
- **`RefundFacts` / `RefundablePayment`** – the read-only slices of the refund and payment documents the rules below consume.
- **`isReversed`** – provider reported the refund failed/settled-back (`reversedAt` is set).
- **`mayHaveMoved`** – whether the provider likely holds the record's money (settled or has a `providerRefundRef`); excludes reversed and unclear-failure records.
- **`exceedsBy` / `exceedsRemaining`** – compute whether an unsent open refund overshoots what the provider can still return.
- **`mayBeSettledByHand`** – whether an operator may record the refund as returned outside the application (hand-paid, final non-disputed refusal, reversed, or over-limit).

## Relationships

- **`@domain-primitives/money`** – imports `addMoney`, `subtractMoney`, `toMinorUnits`, and the `Money` type used by `exceedsBy` and the overflow checks.
- **`@domain-primitives/time`** – imports `DAY_MS`, `MINUTE_MS` (used for time-bound checks in the full file).
- **`./disputes`** – imports `hasDecidedDispute`, `lostChargebackCovers`, and the `DisputablePayment` type (which `RefundablePayment` extends) for chargeback-aware settlement rules.
- **`repository.ts`** – the direct consumer: the arrays are passed as the `$in` set to `updateStatusIfIn` / `upsertConfirmable`, making them the at-most-once guard under concurrent writes.
- **`domain/index.ts`** – barrel re-export; downstream services and the presenter import from here.
- **`services/refund-settlement.ts` / `services/refund-sync.ts`** – call the refund guard predicates (`isOpenRefund`, `isFinalFailure`, `mayBeSettledByHand`, `exceedsRemaining`, etc.) before issuing conditional writes.
- **`scenarios/support/doubles/payments/fake.ts`** – test double that implements the `RefundFacts` / `RefundablePayment` shapes for unit tests of the rules in this file.

## Notes

- The exported collections are **arrays, not `Set`s**, intentionally: they must serve as both a membership test and a spreadable `$in` operand without re-spreading.
- `SETTLEABLE_PAYMENT_STATUSES` deliberately excludes `succeeded` and `canceled`; that exclusion is the at-most-once guarantee for `settlePayment`.
- `SUCCESS_SETTLEABLE_PAYMENT_STATUSES` re-includes `canceled` because money that lands on a canceled intent is real and must be recorded.
- `MONEY_DID_NOT_MOVE_FAILURES` is **not** identical to `FINAL_REFUND_FAILURES`: it adds `insufficient_funds` (retryable, but nothing went out) and removes `disputed` (the bank already returned the money; never settled by hand).
- `isHandRecorded` / `isOpenTransfer` / `mayBeSettledByHand` encode the rule that a manual payment has no PSP to refund through; returning it is purely an operator action.
