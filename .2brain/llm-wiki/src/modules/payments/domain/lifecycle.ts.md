---
source: src/modules/payments/domain/lifecycle.ts
sha256: 3395b6de2ef3acec003f922d8f6bbfe7aaa899903bd321fb57059dc66ca32b31
generated_at: 2026-11-14T21:00:22.106899+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/domain/lifecycle.ts

## Purpose

Defines the payment status guard-sets and refund-state rules that control which conditional writes (`updateStatusIfIn`, `upsertConfirmable`) the repository is allowed to perform. Every exported array is both a membership test *and* the MongoDB `$in` predicate for the write it guards, making the set itself the at-most-once enforcement mechanism rather than a surrounding check.

## Key elements

- **`CONFIRMABLE_PAYMENT_STATUSES`** – `['requires_confirmation', 'declined']`; the only statuses `confirmPayment` may depart from.
- **`IN_FLIGHT_PAYMENT_STATUSES`** – `['requires_action', 'processing']`; statuses that are awaiting the provider; next step is `sync`, never a second `confirm`.
- **`SETTLEABLE_PAYMENT_STATUSES`** – all four non-terminal statuses; the universal guard for any settlement write. Excludes `succeeded`/`canceled`, which is what makes `settlePayment` at-most-once.
- **`SUCCESS_SETTLEABLE_PAYMENT_STATUSES`** – `SETTLEABLE_PAYMENT_STATUSES` + `canceled`; used only by the success write, amount-mismatch write, and provider re-read gate so that money landing on a canceled intent is still recorded.
- **`REAPABLE_PAYMENT_STATUSES`** – same union; allow-list for the retention reaper so a future money-bearing status is never deleted by default.
- **`MANUAL_PROVIDER`** / **`isHandRecorded`** – identifies operator-recorded payments with no PSP behind them.
- **`isOpenTransfer`** – a hand-recorded, `requires_action` payment carrying a `transferReference`; still payable by the buyer via card.
- **`OPEN_REFUND_STATUSES`** / **`isOpenRefund`** – `pending` + `failed` (excluding staff-canceled); the refund is still in play.
- **`FINAL_REFUND_FAILURES`** – refusal codes that end retrying (declined, expired/stolen card, provider_removed, disputed).
- **`UNCLEAR_REFUND_FAILURES`** – `provider_unavailable`, `unknown`; the refund *may* have gone through, so money is never assumed unmoved.
- **`MONEY_DID_NOT_MOVE_FAILURES`** – a superset of final failures (minus `disputed`) plus `insufficient_funds`; safe to hand-settle.
- **`owesBuyerAnotherWay`** – true when the refund is open, not a chargeback, and either reversed or finally refused; the buyer is owed the money outside this refund record.
- **`RefundFacts`** / **`RefundablePayment`** – the read-only slices the rules below consume (extends `DisputablePayment`).
- **`isReversed`** – provider reported the refund came back; `reversedAt` is set and never cleared.
- **`mayHaveMoved`** – the provider holds the money (settled or has a `providerRefundRef`); reversed records are excluded.
- **`exceedsBy`** / **`exceedsRemaining`** – compute and test whether an unsent open refund overshoots the payment's remaining refundable amount.
- **`mayBeSettled`** – operator gate: may a human report this refund's money returned outside the application? (hand-paid pending, provably-not-moved card refund, reversed, or held-unsent; never an unclear failure; `disputed` only once a lost chargeback covers it.)

## Relationships

- **`./disputes`** – imports `DisputablePayment` (base for `RefundablePayment`), `hasDecidedDispute`, and `lostChargebackCovers` used inside `mayBeSettled`.
- **`@domain-primitives/money`** – `addMoney`, `subtractMoney`, `toMinorUnits`, `Money` type power the `exceedsBy` arithmetic.
- **`@domain-primitives/time`** – imports `DAY_MS`, `MINUTE_MS` (likely consumed by `deadline.ts` or `refund-sync.ts` via re-export through `index.ts`).
- **`src/modules/payments/repository.ts`** – the status arrays are the `$in` predicates for its `updateStatusIfIn` / `upsertConfirmable` conditional writes.
- **`src/modules/payments/services/intent.ts`** – reads `CONFIRMABLE_PAYMENT_STATUSES` / `SETTLEABLE_PAYMENT_STATUSES` to guard confirm and settle paths.
- **`src/modules/payments/services/refund-settlement.ts`** – consumes `isOpenRefund`, `MONEY_DID_NOT_MOVE_FAILURES`, `mayBeSettled`, `exceedsRemaining`.
- **`src/modules/payments/services/refund-sync.ts`** – consumes `OPEN_REFUND_STATUSES`, `isFinalFailure`, `UNCLEAR_REFUND_FAILURES`, `isReversed`.
- **`src/modules/payments/domain/index.ts`** – re-exports this module's public surface for the rest of the codebase.
- **`src/modules/payments/domain/display-status.ts`** – maps these statuses to user-facing display strings.
- **`src/modules/payments/presenter.ts`** – reads status sets to shape API responses.
- **`scenarios/support/doubles/payments/fake.ts`** – test double that conforms to the same status vocabulary.

## Notes

- All status collections are **`readonly` arrays, not `Set`s**. This is deliberate: the same value is spread into a MongoDB `$in` clause *and* used with `.includes()` for in-process checks. Converting to a `Set` would require re-spreading for the query.
- There is **no explicit from→to transition table** (unlike `orders/domain/lifecycle.ts`). Every write funnels through `settlePayment`, so only the *from* guard matters; the *to* is decided by that single function.
- `SETTLEABLE_PAYMENT_STATUSES` excludes `succeeded` **and** `canceled`; `SUCCESS_SETTLEABLE_PAYMENT_STATUSES` adds back `canceled` specifically so a late webhook on a canceled intent still records the money in the same transaction.
- `reversedAt` is a **write-once** field: set once by the provider report, never cleared. `isReversed` is therefore a simple undefined check.
- `unclear` failures (`provider_unavailable`, `unknown`) are excluded from `MONEY_DID_NOT_MOVE_FAILURES` *on purpose*—settling one would risk paying the buyer twice.
- `REFUNDABLE_PAYMENT_STATUS` is a single constant (`'succeeded'`), not an array, because refunds can only originate from a successfully landed payment.
