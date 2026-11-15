---
source: src/modules/payments/services/refunds.ts
sha256: a967ac0b8db398d4b1ffa93f9b5d7a00cb704dc9000efb9a6310657df50fc4dd
generated_at: 2026-11-14T21:08:55.453107+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/refunds.ts

## Purpose

Single choke-point for moving money out of a payment in the module: the operator-triggered `refundPayment` and the `order.canceled` listener's compensation (`refundForOrder`) both funnel through `performRefund`. It opens a conditional refund record (reserving `amountRefunded`) before asking the provider, so concurrent refunds can never overdraw the original amount.

## Key elements

- **`RefundRequest`** (interface) — shape of one refund ask: optional `amount`, required `reason`, optional `returnId`, `lines`, `shipping`, `capAtRemaining`, `due`, and `cancelEventId`.
- **`CANCELLATION_REQUEST` / `LATE_PAYMENT_REQUEST`** — frozen `RefundRequest` constants for the two automatic (non-operator) paths.
- **`OpenedRefund`** — `{ payment, refund }` snapshot returned after the opening write.
- **`RefundOutcome`** — `{ payment, leftOpen, refundId }` describing the end state of an attempt.
- **`failureReasonOf`** (private) — maps a thrown error to a `RefundFailureReason` and emits a bounded (500-char) warn log; distinguishes "no answer" from "refused."
- **`recordOwedByHand`** (exported) — writes an audit row flagging that cash/transfer must be handed back outside the app; called once per record, idempotent by construction.
- **`leaveForOperator`** (private) — opens a refund on a hand-recorded payment and leaves it `pending`; no provider call, no auto-settle.
- **`announceOwedByHand`** (private) — enqueues a `PAYMENT_REFUND_OWED_BY_HAND` outbox event inside the opening transaction (hand payments only).
- **`CANCEL_EVENT_WRITE_RETRIES`** (exported, = 5) — max retries for the conditional write that stamps `handledCancelEvents` on the payment.
- **`handledCancelEvent`** (private) — guard that tells the retry loop the event was already processed, preventing an infinite re-read loop.
- **`openRefund`** (private, truncated) — the conditional write that appends the refund row and increments `amountRefunded` atomically; re-reads on a miss and re-checks.

## Relationships

- **`@domain-primitives/money`** — all arithmetic (`addMoney`, `subtractMoney`, `minMoney`), unit conversion (`toMinorUnits`, `padDecimal`), and currency validation (`fitsCurrency`) go through this module; no raw number math in the service.
- **`@domain-primitives/time`** — `MINUTE_MS` is used for retry/sweep timing constants.
- **`@infrastructure/runtime/database`** — `withTransaction` wraps the open-then-settle sequence so the refund row, `amountRefunded` bump, and outbox enqueue commit atomically.
- **`@kernel/outbox`** — `enqueueOutboxEvent` / `nudgeOutbox` / `announceInTransaction` publish `PAYMENT_REFUND_CANCELED` and `PAYMENT_REFUND_OWED_BY_HAND` events downstream.
- **`@kernel/permissions`** — `systemCallerContext` supplies the actor when no human caller is present (event-driven refunds).
- **`@kernel/ability`** — `holds` is used for permission checks before a refund is opened.
- **`@infrastructure/observability/audit`** — `recordAudit` writes the durable audit trail for every refund action.
- **`@infrastructure/observability/forbidden`** — `auditForbidden` records denied refund attempts.
- **`@modules/access`** — `ownOrderFlag` (from the access module's protection domain) gates whether the caller can refund an order they do not own.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` / `fieldError` shape the HTTP payloads returned to the API layer.
- **`@infrastructure/i18n`** — `t` localises user-facing error/reject messages.
- **`@infrastructure/adapters/logger`** — structured warn/error logs for provider failures and hand-refund alerts.

## Notes

- **Concurrency model:** the refund row is opened *before* the provider call. The opening write is one conditional `update` that both appends the row and increments `amountRefunded`; a miss means a racing refund won, so the payment is re-read and the whole guard re-evaluated. A failed provider call leaves the record `failed` (still open), retried by a sweep with the same idempotency key.
- **Provider dispatch:** always uses `payment.provider`, never the deployment-level default. A payment taken by Stripe stays refundable through Stripe even if the shop has since switched to a different PSP.
- **Hand-recorded payments** have no provider. Their refunds stay `pending` until an operator explicitly calls `settleRefundByHand`; no privileged caller can auto-settle them.
- **`capAtRemaining: true`** switches a would-be rejection (amount no longer fits) into a clamp-and-retry, important when a racing refund outdates the caller's read.
- **`cancelEventId`** is stamped into `payment.handledCancelEvents` in the same write that opens the record, making `order.canceled` redelivery a no-op after the first successful write.
- **Error text handling:** provider error strings are truncated to 500 chars before logging and are *never* persisted on the refund record.
- The module header explicitly forbids any other file in the payments module from moving money out; this service is the sole exit.
