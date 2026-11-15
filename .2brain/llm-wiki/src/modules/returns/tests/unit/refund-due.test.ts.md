---
source: src/modules/returns/tests/unit/refund-due.test.ts
sha256: d85d2ffb74fe57c26dc48d121c2c1457b1cae8b81d5c4ae2d68fbd75d3679036
generated_at: 2026-11-14T21:49:16.257569+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/unit/refund-due.test.ts

## Purpose
Unit tests for the refund-deadline computation (`refundDueByOf`) and the two proof-of-sending helpers (`proofOpensRefund`, `proofOpenedRefund`). They verify that the computed due date and `dueRule` conform to the EU directives (2011/83/EU for withdrawal, 2019/771 for faulty/wrong items) across all return-reason branches and edge cases (nothing arrived, proof only, goods after deadline, goodwill).

## Key elements
- **`refundDueByOf`** (imported from `../../domain`) — the function under test. Takes `{ reason, withdrawalDueBy?, receivedAt?, proofOfSendingAt? }` and returns `{ dueBy, dueRule }`; the tests assert it is absent (via `toBeUndefined`) for certain inputs.
- **`proofOpensRefund(reason)`** (imported from `../../domain`) — returns `true` only for `'withdrawal'`; tested via `it.each` over all four reasons.
- **`proofOpenedRefund(state)`** (imported from `../../domain`) — returns whether the current return state has been opened by a proof of sending; tested for withdrawal-with-proof, withdrawal-without-proof, and defective-with-proof.
- **`withdrawalRefundDueBy(told, tz)`** (imported from `@modules/orders`) — computes the 14-day statutory withdrawal deadline; used to build test fixtures.
- **`END_OF_DAY_15_WINTER`** — fixed timestamp (`2026-03-15T22:59:59.999Z`) representing end of day 15 in Rome (UTC+1), used as the expected deadline for withdrawal cases.

## Relationships
- **`src/modules/returns/domain/refund-due.ts`** — implements the three functions under test; this file exercises their public behavior.
- **`src/modules/returns/domain/index.ts`** — barrel file that re-exports `refundDueByOf`, `proofOpensRefund`, `proofOpenedRefund`; the test imports from this barrel (`../../domain`).
- **`src/modules/orders/index.ts`** — re-exports `withdrawalRefundDueBy`; the test imports it from `@modules/orders`.
- **`src/modules/orders/domain/withdrawal.ts`** — where `withdrawalRefundDueBy` is implemented; supplies the 14-day deadline that feeds into the withdrawal test cases.

## Notes
- All withdrawal deadlines are asserted against a **Rome / winter (UTC+1)** instant. If the system ever switches timezone handling or DST rules, the hardcoded `END_OF_DAY_15_WINTER` constant will break.
- For `faulty` / `wrong_item` reasons the `dueRule` is `'faulty'` (not `'defective'` or `'wrong_item'`) — the test asserts this collapsed label.
- `'other'` (goodwill) returns always yield an absent result (asserted with `toBeUndefined`), regardless of what dates are present.
- The "earlier of proof and goods" rule means `proofOfSendingAt` and `receivedAt` compete; the test confirms the earlier one wins when both are present.
- `proofOpenedRefund` is `false` for defective even when a proof date exists — the proof there is purely record-keeping, not deadline-opening.
