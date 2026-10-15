---
source: src/modules/payments/services/refunds.ts
sha256: b7bb8657c1acf89e87d5c6f6230f3c7bf103cc2e3cd99354a156b1e93bcb5953
generated_at: 2026-10-15T11:31:21.929017+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/refunds.ts

## Purpose

The single service in the payments module that moves money out. It exposes the operator-facing `refundByOrder` action and the automatic `ORDER_REFUND_OWED` compensation (`refundForOrder`), both funnelled through a shared `performRefund` path. Refunds are reserved with one conditional write before the provider is ever contacted, so racing requests cannot over-refund a payment.

## Key elements

- **`RefundRequest`** (interface) — the shape of a refund ask: optional `amount` (decimal, defaults to everything remaining), `reason`, optional `returnId`, `lines`, and `shipping`.
- **`CANCELLATION_REQUEST`** (frozen const) — the fixed request the automatic listener path uses: full amount, reason `cancellation`.
- **`OpenedRefund`** (interface) — the payment + refund record returned immediately after the conditional write succeeds.
- **`remainingOf(payment)`** — computes `amount − amountRefunded` in minor units; the guard every refund must fit within.
- **`openRefund(payment, request, actor?, session?)`** — the atomic "reserve" step. Generates the `RefundRecord`, computes the new `amountRefunded`, and calls `paymentRepository.addRefund` as one conditional write. On a miss outside a caller session it re-reads the payment and retries; inside a caller session a miss is final. Also appends a `refund_issued` timeline row to the order in the same transaction.
- **`failureReasonOf(error, refund)`** (private) — classifies a rejected provider call into a `RefundFailureReason` code; logs the provider's wording (truncated to 500 chars) but never stores it.
- **`leaveForOperator(orderId, payment)`** (private) — the no-provider fallback for hand-paid orders in the automatic path: logs a warning, records an audit row under `SYSTEM_ACTOR`, and returns the payment unchanged.
- **`isFullyRefunded(payment)`** (private) — true when `remainingOf` is zero **and** every record is `succeeded`; used to drive `displayStatus`.
- **`announceRefund(payment, refund, context, outcome)`** (private) — writes the log line and the audit row for a settled refund. (File is truncated; the `PAYMENT_REFUNDED` event publish via `announceInTransaction` is expected here.)
- **`performRefund` / `refundByOrder` / `refundForOrder`** — not visible in the truncated content but referenced by the module doc-block as the two public entry points.

## Relationships

- **`@infrastructure/runtime/database`** — `withTransaction` wraps the standalone `openRefund` write when no caller session is supplied.
- **`@modules/orders`** — `orderService.appendTimeline` records the `refund_issued` event on the order in the same transaction as the refund write.
- **`@infrastructure/observability/audit`** — `recordAudit` is called in `leaveForOperator` and (per the truncated `announceRefund`) for admin-initiated refunds.
- **`@kernel/permissions`** — `SYSTEM_ACTOR` and `callerForSubject` build the audit caller for the automatic path; `AuthContext` drives the operator path.
- **`@kernel/outbox`** — `announceInTransaction` publishes the `PAYMENT_REFUNDED` domain event (imported from `@kernel/events`) so downstream listeners react atomically with the settlement.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` / `fieldError` shape the HTTP responses returned by `refundByOrder`.
- **`@infrastructure/adapters/logger`** — structured log lines for warnings (provider refusal, hand-paid fallback) and info (settlement confirmation).
- **`@infrastructure/i18n`** — `t` provides localised user-facing error messages.
- **`../domain`** — `REFUNDABLE_PAYMENT_STATUS` gates whether a re-read retry in `openRefund` is still legal.
- **`../audit`** — `paymentsAuditActions` supplies the audit action codes (`PAYMENT_REFUND_OWED_BY_HAND`, etc.).
- **`../repository`** — `paymentRepository.addRefund` and `.findByOrderId` perform the conditional write and the freshness re-read.

## Notes

- **Idempotency key is per record, not per payment.** The format `refund:{paymentId}:{refundId}` means two distinct partial refunds are separate keys (so the provider won't deduplicate them), while a retry of the *same* record reuses its key.
- **Provider is read from the payment row, never from deployment config.** A `manual` payment has no provider to call; a PSP refund must go back to whichever PSP actually captured the money, even if the deployment has since switched PSPs.
- **Payment status never changes on refund.** It stays `succeeded`; `displayStatus` is derived. The only thing preventing a double-refund is the `amountRefunded` condition in `addRefund`.
- **Inside a caller-supplied session, a conditional-write miss is final.** There is no re-read-and-retry loop because the caller's transaction owns the authoritative state; re-reading outside it would see a stale document.
- **Stryker markers** (`Stryker disable all` / `restore all`) wrap `logger` calls in `leaveForOperator` and `announceRefund` to suppress mutation-testing noise on pure log statements.
- **`MAX_ERROR_LENGTH = 500`** caps how much of a provider's raw error string appears in log lines; the full string is never persisted on the refund record.
