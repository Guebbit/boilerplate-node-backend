---
source: src/modules/payments/domain/dispute-end.ts
source_sha256: c2201fed4c4bc625496e06fd4fdb9abe6a7755a500e6dac575e7a3437537fa43
context_sha256: 8046a1e9cc178eb605945d3ce8c20c8784b8134c6a1623b2221fe07492248b1e
generated_at: 2026-11-22T06:43:30.220957+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/domain/dispute-end.ts

## Purpose
Pure domain rules for what a dispute's ending leaves owed on a payment's refunds. Refunds the bank's dispute refused (failed with reason `disputed`) waited for the dispute to be decided. Once no dispute is open, they are owed another way, and staff must be told how. A refund staff marked returned because the bank kept the money becomes owed again if that dispute is then won. The file does no I/O. The write step reads the payment and announces the result.

## Key elements
- **`refundsOwedAfterDispute(payment)`** returns the refunds to hand back to staff when a dispute ends.
  - It returns `[]` while any dispute on the payment is still open.
  - Otherwise it selects refunds with status `failed` and failure reason `disputed`.
  - Each entry carries `reversed`, `bankKept` and, when applicable, `otherCurrency`.
  - `bankKept` is computed over every dispute on the payment, not just the one that ended.
- **`disputeBehindRefund(payment, refund)`** returns the provider dispute id a refund being marked returned was settled against.
  - It is the latest `observedAt` dispute in which the bank kept money.
  - It returns `undefined` if the refund's failure reason isn't `disputed`, or if no such dispute exists.
- **`refundsOwedAfterWin(payment, previous, ended, disputeId)`** returns the refunds a win makes owed again.
  - It applies only when `previous` had the bank keeping money and `ended` does not.
  - It selects `succeeded` refunds whose `settledAgainstDispute` equals `disputeId`.
  - Each entry is flagged `reversed: true`, `bankKept: false`, `markedReturned: true`.
- **`RefundOwedAfterDispute`** (exported interface) is the result entry: `refundId`, `amount`, `currency`, `reversed`, `bankKept`, and optional `otherCurrency`, `markedReturned`, `followsFlip`.
- Internal interfaces `WaitingRefund`, `StoredDisputeFacts` and `PaymentAtDisputeEnd` describe the minimal slice of the data the rules read.

## Relationships
- **`src/modules/payments/domain/disputes.ts`** supplies the dispute predicates and the `DisputeFacts` type: `hasOpenDispute`, `anyDisputeKeptMoney`, `bankKeptMoney` and `otherCurrencyKept`.
- **`src/modules/payments/domain/lifecycle.ts`** supplies `isReversed`, which sets the `reversed` flag.
- **`src/types/index.ts`** (imported as `@types`) supplies the `RefundStatus` and `RefundFailureReason` enums.
- `src/modules/payments/services/disputes.ts` and `src/modules/payments/services/refunds.ts` are the likely callers, since the file's doc says a write step reads the payment and announces. The file itself doesn't show them.
- `src/modules/payments/tests/unit/dispute-end.test.ts` is the unit test for this module.
- `src/modules/payments/domain/index.ts` and `src/modules/payments/providers/index.ts` are neighbors in the graph. The file doesn't show how it relates to them.

## Notes
- The payment passed in must be the state after the dispute's write, read in the writing transaction.
- `refundsOwedAfterWin` matches by dispute id, so refunds tied to a second dispute are left untouched.
- `followsFlip` is declared in the result type but is not set by any function in this file.
- Refunds that settled or were voided in the meantime are not owed. Only `failed` + `disputed` refunds qualify in `refundsOwedAfterDispute`.
- `disputeBehindRefund` uses `toSorted`, which requires a recent JS runtime (Node 20+).
