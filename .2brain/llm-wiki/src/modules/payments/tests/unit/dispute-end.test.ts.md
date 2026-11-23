---
source: src/modules/payments/tests/unit/dispute-end.test.ts
source_sha256: 99d5508641ba79d3a6761f8cc068467691571e16c5da6765987a6c6f599b5e84
context_sha256: 172d32ce35ac0582a0ab9b552a38a5439514bfc741b2aa8b388a62154b13b9b9
generated_at: 2026-11-22T07:05:10.021302+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/unit/dispute-end.test.ts

## Purpose
Unit tests for the pure rules in `src/modules/payments/domain/dispute-end.ts` that decide what refunds are owed once a dispute ends. No database is involved: refund and dispute records are built in-memory, and each test row names one refund state and one dispute state.

## Key elements
- **Fixture builders**
  - `refund(id, over)`: a refund record, defaulting to `failed` with failure reason `disputed`, 30.00 EUR.
  - `dispute(over)`: a `DisputeFacts` object, defaulting to a lost chargeback of 100.00 EUR.
  - `stored(disputeRef, minutes, over)`: a dispute plus `disputeRef` and `observedAt`, used for ordering.
  - `returned(id, against)`: a succeeded refund with `settledAgainstDispute` set.
- **`refundsOwedAfterDispute` tests**
  - Lists open refunds refused as disputed, in the payment's order.
  - Excludes refunds that are settled, voided (canceled), refused for another reason, or still pending.
  - Lists nothing while another dispute on the payment is still open.
  - Sets `reversed` when `reversedAt` is present.
  - Sets `bankKept` per kind and status: a lost or accepted chargeback is kept; won, closed, or an inquiry is not.
  - `bankKept` stays true if an earlier dispute lost, even when the one that just ended was won.
  - Sets `otherCurrency` when the loss was in a different currency, and omits it otherwise.
- **`keptInOtherCurrency` tests**: true only when the bank kept money in a currency other than the payment's.
- **`disputeBehindRefund` tests**
  - Returns the `disputeRef` of the latest dispute in which the bank kept money, ignoring open ones.
  - Returns `undefined` when the refund was not refused as disputed, when the bank kept nothing, or when there are no disputes.
- **`refundsOwedAfterWin` tests**
  - Lists refunds marked returned against the given dispute ref as owed again, with `reversed: true`, `bankKept: false` and `markedReturned: true`.
  - Lists nothing when the dispute was not lost before, or is still lost.

## Relationships
- Imports `refundsOwedAfterDispute`, `refundsOwedAfterWin`, `keptInOtherCurrency`, `disputeBehindRefund` and the `DisputeFacts` type from `../../domain` (`src/modules/payments/domain/index.ts`), the barrel over `src/modules/payments/domain/dispute-end.ts` and `src/modules/payments/domain/disputes.ts`.
- Imports `DisputeKind`, `DisputeStatus`, `RefundFailureReason` and `RefundStatus` from `@types` (`src/types/index.ts`).
- `src/modules/payments/services/refunds.ts` and the `src/modules/returns/services/*` neighbors are not imported here. The tests only cover the pure rules those services would consume.

## Notes
- Refund records are loose objects with a fake `_id.toString()`, which is only what the rule reads from a stored refund.
- Dates use a fixed UTC base (2026-10-01 10:00) plus offset minutes, so ordering is deterministic.
