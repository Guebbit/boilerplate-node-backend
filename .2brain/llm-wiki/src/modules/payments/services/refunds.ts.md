---
source: src/modules/payments/services/refunds.ts
source_sha256: 3131337a3d1c03d69d556d495e8b2879c48671c5fc9ddb6c591442abd73a3c0e
context_sha256: 50b9d4ec0251013ff7c3a6f98cd7d9ac7fe677e7ede8861a727013b847288ad6
generated_at: 2026-11-22T06:52:47.106771+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/services/refunds.ts

## Purpose
The single place in the payments module that moves money back to customers. It serves the operator action (`refundPayment`) and the `order.canceled` listener's compensation (`refundForOrder`), both through `performRefund`. A refund is recorded as a row on the payment before the provider is asked, and settles only once the provider confirms.

## Key elements
- `RefundRequest`: input shape. Fields: optional `amount` (absent means everything still refundable), `reason`, `returnId`, `lines`, `shipping`, `capAtRemaining`, `due`, `cancelEventId` and `paidOutside`.
- `CANCELLATION_REQUEST`: frozen request with reason `cancellation`, used by automatic callers.
- `LATE_PAYMENT_REQUEST`: frozen request with reason `late_payment`, for money that arrives after the order can no longer be paid.
- `OpenedRefund`: a newly opened refund record together with the payment as it stood right after.
- `RefundOutcome`: result of a refund call, with `payment`, `leftOpen` and `refundId`. `leftOpen` means money is waiting on a provider answer or an operator.
- `recordOwedByHand(payment, refund, context?)`: writes an audit row (`PAYMENT_REFUND_OWED_BY_HAND`, target type `order`) so a person sees that cash or a transfer is owed outside the app. It falls back to `systemCallerContext('Payment')` when no caller is given.
- `leaveForOperator` (internal): opens a refund on a hand-paid payment and leaves it `pending`. It logs a warning, audits the request and records the owed-by-hand row, then returns `leftOpen: true`. It returns `null` if nothing was left to open.
- `announceOwedByHand` (internal): enqueues a `PAYMENT_REFUND_OWED_BY_HAND` outbox event inside the opening transaction, only for hand-recorded payments.
- `failureReasonOf` (internal): maps a provider error to a closed `RefundFailureReason`. A `PaymentProviderError` supplies its own code and anything else becomes `unknown`. It logs the provider's wording, truncated to 500 characters (`MAX_ERROR_LENGTH`), and does not store it.
- `CANCEL_EVENT_WRITE_RETRIES` (5): how many times a stamped refund write may miss and be retried before the call throws.

The prompt ends partway through the file, so `performRefund`, `refundPayment`, `refundForOrder`, `refundOutside` and the other helpers named in the header are not detailed here.

## Relationships
- **`../repository`, `../model`, `../domain`**: persistence and domain rules, including `exceedsRemaining`, `isHandRecorded`, `isOpenRefund` and `mayBeCanceled`.
- **`./refund-settlement`**: helpers for settling and announcing refunds (`settleRefund`, `recordRefundFailure`, `announceRefund`, `remainingOf`, `isFullyRefunded`, `stampOrder`).
- **`./refund-sync`**: provides `rereadRefund`.
- **`../providers` and `../providers/registry`**: provider dispatch and the `PaymentProviderError` type.
- **`@kernel/outbox`**: `enqueueOutboxEvent`, `announceInTransaction` and `nudgeOutbox` publish events (such as `PAYMENT_REFUND_OWED_BY_HAND`) from within transactions.
- **`@kernel/events`**: the `DomainEventMap` type.
- **`@kernel/permissions`**: `systemCallerContext` supplies the actor when no caller exists.
- **`@infrastructure/runtime/database`**: `withTransaction`.
- **`@infrastructure/observability/audit`**: `recordAudit` writes audit rows, using action names from `../audit`.
- **`@infrastructure/adapters/logger`**: used for warnings.
- **`@infrastructure/http/response`**: `generateSuccess`, `generateReject` and `fieldError`.
- **`@infrastructure/i18n`**: `t`.
- **`@domain-primitives/money` and `@domain-primitives/time`**: money arithmetic and formatting, plus `MINUTE_MS`.
- **`@modules/access`**: `ownOrderFlag`.
- **`@modules/orders` and `@modules/shop`**: `orderService`, `withdrawalRefundDueBy` and `shopTimezone`.

## Notes
- **Record before provider:** opening a refund is one conditional write that also raises `amountRefunded`, so racing refunds cannot return more than was paid.
- **Failed refunds:** a refusal leaves the record `failed`. It stays open and the sweep retries it with the same idempotency key.
- **Full refunds:** a fully refunded payment stays `succeeded`. `displayStatus` reads `refunded` once the records add up to `amount`, and `addRefund`'s condition on `amountRefunded` prevents a double refund.
- **Provider dispatch:** it uses the payment's own `provider`, not the deployment's configured one. A `manual` payment has no provider to ask, and a real refund must go to the provider that took the money.
- **Hand-paid payments:** refunds stay `pending` for an operator (`settleRefundByHand`). Only `paidOutside` (via `refundOutside`) settles one on the spot, with no owed-by-hand announcement.
- **Idempotency:** a redelivered cancel event does not open a second record, because `cancelEventId` is stamped on the payment in the same write.
- **`capAtRemaining`:** takes at most what is left instead of refusing, so a return's amount clamped on a stale read does not fail after a racing refund.
