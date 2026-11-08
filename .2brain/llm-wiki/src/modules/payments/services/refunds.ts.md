---
source: src/modules/payments/services/refunds.ts
sha256: b96b9c5ad2b30ff2ef71d61c6f80e1972c75209cea660978fa100ad6e4246589
generated_at: 2026-11-08T07:28:59.238994+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/refunds.ts

## Purpose

Implements the two entry points for returning money on a payment — the operator action `refundPayment` and the automatic `refundForOrder` (triggered by `order.canceled`) — both delegating to a shared `performRefund`. This file owns the full refund lifecycle: opening the record, calling the PSP, and settling the outcome. No other file in the payments module is permitted to move money out.

## Key elements

- **`RefundRequest`** (interface) — shape of a single refund: optional `amount` (decimal string), required `reason`, optional `returnId`, `lines`, `shipping`, and `capAtRemaining` (clamp-to-remaining flag for race-tolerant reads).
- **`CANCELLATION_REQUEST` / `LATE_PAYMENT_REQUEST`** — frozen `RefundRequest` constants used by automatic callers (no amount = everything still refundable).
- **`OpenedRefund`** (interface) — the freshly opened `RefundRecord` alongside the payment as it stood immediately after the write.
- **`RefundOutcome`** (interface) — final state of a refund attempt: current payment, `leftOpen` flag, and the written `refundId`.
- **`failureReasonOf`** (private) — maps a provider rejection to a `RefundFailureReason`, logs the provider's wording (capped at 500 chars) but never stores it.
- **`recordOwedByHand`** (exported) — writes an audit row (`PAYMENT_REFUND_OWED_BY_HAND`) naming the order, refund, and amount so staff can see a cash/transfer obligation outside the app.
- **`leaveForOperator`** (private) — opens a refund on a hand-recorded payment and leaves it `pending`; no provider is called, no auto-settle is performed.
- **`announceOwedByHand`** (private) — enqueues a `PAYMENT_REFUND_OWED_BY_HAND` outbox event within the opening transaction.
- **`openRefund`** (exported) — core write: reserves the amount and appends the `RefundRecord` in one conditional MongoDB write (raising `amountRefunded` atomically). Retries on conditional-write miss (stale read). Commits the order-timeline row in the same transaction.
- **`refundPayment` / `refundForOrder` / `performRefund`** (exported, below truncation) — the public API surface and the shared orchestration (permission check → open → provider call → settle).

## Relationships

- **`@domain-primitives/money`** — all amount arithmetic (`addMoney`, `subtractMoney`, `minMoney`, `fitsCurrency`, `toMinorUnits`, `padDecimal`, `toDecimalString`).
- **`@domain-primitives/time`** — `MINUTE_MS` used for retry/sweep timing.
- **`@infrastructure/adapters/logger`** — warn-level logs for provider failures, hand-refund notices, and unclear provider responses.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` / `fieldError` shape the API response for operator-facing refund calls.
- **`@infrastructure/i18n`** — `t` for localized user-facing messages in responses.
- **`@infrastructure/observability/audit`** — `recordAudit` writes the audit trail for every refund action and the owed-by-hand obligation.
- **`@infrastructure/observability/forbidden`** — `auditForbidden` logs access-denied attempts.
- **`@infrastructure/runtime/database`** — `withTransaction` wraps the open + timeline-write + outbox sequence in a single DB transaction.
- **`@kernel/ability`** — `holds` checks the caller's capability before proceeding.
- **`@kernel/permissions`** — `systemCallerContext` supplies the actor identity for automatic (listener-driven) refunds.
- **`@kernel/outbox`** — `enqueueOutboxEvent`, `announceInTransaction`, `nudgeOutbox` publish domain events (`PAYMENT_REFUND_CANCELED`, `PAYMENT_REFUND_OWED_BY_HAND`) transactionally.
- **`@kernel/events`** — `DomainEventMap` type constrains event payloads.
- **`@modules/access`** — `ownOrderFlag` scopes which orders the caller may refund.

## Notes

- **Provider dispatch is per-payment, not per-deployment.** The refund goes to whichever PSP actually charged the card (`payment.provider`), even if the deployment's configured provider has since changed. `manual` payments have no provider call at all.
- **Atomic over-refund guard.** The conditional write that opens a record also increments `amountRefunded` in the same operation; a second racing refund simply finds insufficient remainder and returns `null`.
- **Failed provider calls are not terminal.** The record is left `failed` (an open status) and is retried by a sweep job using the *same* idempotency key, so the provider sees one logical refund.
- **Payment status is never downgraded.** A payment that was `succeeded` stays `succeeded` after any refund; `displayStatus` flips to `refunded` only when the refund records sum to the full `amount`.
- **Hand-paid refunds are never auto-settled.** `leaveForOperator` opens the record and stops; settlement requires an explicit `settleRefundByHand` call by an operator.
- **`capAtRemaining`** exists to handle the race where a return's displayed amount becomes stale between read and write; instead of rejecting, the refund is clamped to what remains and the shortfall is re-evaluated on a subsequent read.
- **Provider error wording is ephemeral.** It is logged (truncated to 500 chars) but never persisted on the record, since it is arbitrary third-party text.
