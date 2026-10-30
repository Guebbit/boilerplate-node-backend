---
source: src/modules/payments/domain/lifecycle.ts
sha256: 0e702be1c69deb55684b4252eae492f467acf47494f201085cf45a8c49feca73
generated_at: 2026-10-29T05:05:19.779177+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/domain/lifecycle.ts

## Purpose

Defines which payment and refund statuses each domain operation is allowed to act from, and encodes the refund-settlement decision rules (reversal, finality, overshoot, hand-settlement eligibility). Every status array here doubles as the `$in` predicate for the conditional writes in `repository.ts`, making the array itself the concurrency guard rather than an adjacent check.

## Key elements

- **`CONFIRMABLE_PAYMENT_STATUSES`** – `['requires_confirmation', 'declined']`; the only states `confirmPayment` may originate from.
- **`IN_FLIGHT_PAYMENT_STATUSES`** – `['requires_action', 'processing']`; states that indicate the provider has not decided yet and the next step is `sync`.
- **`SETTLEABLE_PAYMENT_STATUSES`** – all non-terminal states; the at-most-once gate for `settlePayment` (terminal states are absent, so retried webhooks find nothing to move).
- **`SUCCESS_SETTLEABLE_PAYMENT_STATUSES`** – `SETTLEABLE` + `'cancelled'`; used only by the success write, amount-mismatch write, and provider re-read gate.
- **`REAPABLE_PAYMENT_STATUSES`** – `SETTLEABLE` + `'cancelled'`; the allow-list the retention reaper deletes against (safe by default for new statuses).
- **`MANUAL_PROVIDER` / `isHandRecorded`** – identifies operator-recorded payments with no PSP behind them.
- **`isOpenTransfer`** – a hand-recorded `requires_action` payment carrying a `transferReference`; still payable by the buyer.
- **`REFUNDABLE_PAYMENT_STATUS`** – the single status (`'succeeded'`) from which money can be returned.
- **`OPEN_REFUND_STATUSES` / `isOpenRefund`** – `pending` and `failed` (minus staff-canceled) are "open"; `succeeded` is closed.
- **`FINAL_REFUND_FAILURES`** – refusal reasons that end retrying (`declined`, `expired_or_canceled_card`, `lost_or_stolen_card`, `provider_removed`, `disputed`).
- **`UNCLEAR_REFUND_FAILURES`** – `provider_unavailable`, `unknown`; the refund *may* have gone through.
- **`MONEY_DID_NOT_MOVE_FAILURES`** – final failures (minus `disputed`) plus `insufficient_funds`; grounds for hand-settlement.
- **`owesBuyerAnotherWay`** – the buyer is owed money outside the provider (reversed, or finally refused) and must be asked how to pay.
- **`RefundFacts` / `RefundablePayment`** – narrow structural types the rules read; `RefundablePayment` extends `DisputablePayment`.
- **`isReversed`** – `reversedAt !== undefined`; the bank sent the settled refund back.
- **`exceedsBy` / `exceedsRemaining`** – whether an unsent open refund would exceed the payment amount given other moved/holding refunds.
- **`mayBeSettledByHand`** – the operator's gate for reporting a refund's money as returned outside the application (respects hand-recorded, reversal, final-failure, and overshoot rules).

## Relationships

- **`src/domain-primitives/money.ts`** – imports `addMoney`, `subtractMoney`, `toMinorUnits`, `Money`; used by `exceedsBy` for the overshoot calculation.
- **`src/modules/payments/domain/disputes.ts`** – imports `hasDecidedDispute`, `lostChargebackCovers`, `DisputablePayment`; `RefundablePayment` extends `DisputablePayment` and the `mayBeSettledByHand` logic consults chargeback coverage.
- **`src/modules/payments/repository.ts`** – consumes the status arrays as `$in` values in `updateStatusIfIn` / `upsertConfirmable`; the arrays *are* the write guards.
- **`src/modules/payments/services/refunds.ts`**, **`refund-sync.ts`**, **`refund-settlement.ts`** – apply the refund decision rules (`isOpenRefund`, `isFinalFailure`, `exceedsRemaining`, `mayBeSettledByHand`, `owesBuyerAnotherWay`).
- **`src/modules/payments/services/intent.ts`** – gates `confirmPayment` via `CONFIRMABLE_PAYMENT_STATUSES`.
- **`src/modules/payments/domain/index.ts`** – barrel re-export for the domain folder.
- **`scenarios/support/doubles/payments/fake.ts`** – test double that exercises these status predicates.

## Notes

- **Arrays, not Sets.** Each status constant is a `readonly` array so it can be used verbatim as a MongoDB `$in` operator without re-spreading. A `Set` would need `Array.from(...)` for the query path.
- **No transition graph.** Unlike `orders/domain/lifecycle.ts`, there is no `from → to` map; all settlement transitions funnel through a single `settlePayment` function, so only the *from* set matters here.
- **`disputed` is final but not "money didn't move."** It is in `FINAL_REFUND_FAILURES` (retry stops) but excluded from `MONEY_DID_NOT_MOVE_FAILURES` (the bank already took the money back).
- **`insufficient_funds` is the inverse case.** It is retried (not final) yet proves no money left the shop, so it *is* in `MONEY_DID_NOT_MOVE_FAILURES`.
- **At-most-once is structural.** `SETTLEABLE_PAYMENT_STATUSES` excludes `succeeded` and `cancelled`; a second write simply fails its `$in` predicate under mongod's document lock. There is no additional idempotency key at this layer.
