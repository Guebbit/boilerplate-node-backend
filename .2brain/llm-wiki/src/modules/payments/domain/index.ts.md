---
source: src/modules/payments/domain/index.ts
source_sha256: d95098af7d77abb782f85cbeca5654e02b9ddab2de00903b766e03027a254970
context_sha256: d847593ec59b8cfb1f53ff6a4020d39f707425200ea443b172a9ef496d1840a5
generated_at: 2026-11-22T06:44:02.024711+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/domain/index.ts

## Purpose
Barrel file for the payments domain layer. It re-exports the pure business rules (no Express, Mongoose or tier dependencies, enforced by lint) so the rest of the module imports them from one place. The domain folder exists because the payment status vocabulary is 6-wide, which makes a `domain/` folder mandatory. The rules are kept here rather than as scattered constants beside each write that uses them.

## Key elements
The file contains no logic of its own, only re-exports grouped by source file:

- **`./lifecycle`**
  - Status sets: `CONFIRMABLE_PAYMENT_STATUSES`, `IN_FLIGHT_PAYMENT_STATUSES`, `SETTLEABLE_PAYMENT_STATUSES`, `SUCCESS_SETTLEABLE_PAYMENT_STATUSES`, `REAPABLE_PAYMENT_STATUSES`, `REFUNDABLE_PAYMENT_STATUS`.
  - Provider and transfer: `MANUAL_PROVIDER`, `isHandRecorded`, `isOpenTransfer`.
  - Refund state: `OPEN_REFUND_STATUSES`, `isOpenRefund`, `FINAL_REFUND_FAILURES`, `UNCLEAR_REFUND_FAILURES`, `MONEY_DID_NOT_MOVE_FAILURES`, `isFinalFailure`, `isReversed`.
  - Other rules: `mayBeCanceled`, `mayBeSettledByHand`, `refundDueBy`, `nextRefundAttemptAt`, `owesBuyerAnotherWay`, `exceedsRemaining`, `exceedsBy`.
  - Type: `RefundDue`.
- **`./disputes`**
  - Open or lost chargeback rules: `OPEN_DISPUTE_STATUSES`, `openDisputeFilter`, `isOpenDispute`, `hasOpenDispute`, `hasOpenChargeback`, `lostToChargebacks`.
  - Money kept by the bank: `bankKeptMoney`, `keptInOtherCurrency`, `anyDisputeKeptMoney`, `otherCurrencyKept`.
  - Types: `DisputeFacts`, `DisputablePayment`.
- **`./dispute-end`**: `refundsOwedAfterDispute`, `refundsOwedAfterWin`, `disputeBehindRefund`, and the type `RefundOwedAfterDispute`. These cover the refunds a dispute ending hands back to staff.
- **`./transfer-reference`**: `buildReference` and `parseReference`, for the RF creditor reference on bank-transfer payments and its admin-side parse.
- **`./display-status`**: `displayStatusOf` and `displayStatusFilter` (the label a payment shows and the query behind each label), plus the type `DisplayStatusInput`.

## Relationships
- Re-exports from the sibling files `lifecycle.ts`, `disputes.ts`, `dispute-end.ts`, `transfer-reference.ts` and `display-status.ts`. Those files hold the implementations.
- The other listed neighbors (`src/modules/payments/index.ts`, `presenter.ts`, `repository.ts`, the `services/*` files — `announce`, `deadline`, `disputes`, `external-refunds`, `intent`, `list` — and `scenarios/support/doubles/payments/fake.ts`) are connected to this file in the dependency graph. The file itself does not show how they use it.

## Notes
- Add a new domain rule to its source file and then export it here. Consumers go through this barrel.
- Types are re-exported separately with `export type`.
