---
source: src/modules/payments/services/refund-settlement.ts
sha256: 2c1c0f06bd66c97b9c0b1ae654dc8c53666bcef33835e8284a8f09390b9897a9
generated_at: 2026-10-29T05:12:34.958645+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/refund-settlement.ts

## Purpose

Handles the terminal states of a refund record: settling it to `succeeded` (stamping the order's payment status and emitting `payment.refunded` via the outbox) or recording a provider refusal with retry scheduling. Split out from `refunds.ts` so that provider-side flows (`refund-sync.ts`) and outgoing flows (`refunds.ts`) can share settlement logic without importing each other.

## Key elements

- **`remainingOf(payment)`** — Computes the still-refundable amount in minor units: paid minus pending refunds minus chargeback losses.
- **`refundRow(refund)`** — Builds the timeline-row shape (id, amount, currency, closed reason code) for order timeline entries.
- **`isFullyRefunded(payment)`** — True when remaining is ≤ 0 *and* no refund is still open.
- **`announceRefund(payment, refund, context, outcome, byHand)`** — Writes the log line and the audit entry for a settled refund (the `payment.refunded` event itself is written by `settleRefund`, not here).
- **`refundedPayload(payment, refund)`** — Builds the `payment.refunded` domain-event payload (including optional `returnId` and `goods.lines`).
- **`stampOrder(payment, session)`** — Calls `orderService.markPaymentStatus` to set `refunded` or `partially_refunded`, inside the caller's transaction.
- **`writeSettlement(payment, refund, fields, session, actor?)`** — Performs the settlement writes: repository `settleRefund`, order stamp, timeline append. Returns `null` if the record was no longer open.
- **`settleRefund(payment, refund, fields, context, outcome?)`** — Orchestrates a full settlement: conditional write + outbox announcement in one transaction, then fires `announceRefund`. Returns `null` if another caller settled first.
- **`isNewFailure(refund, failureReason)`** — True when the attempt count is 0 or the reason differs from the last; gates timeline-row writes to avoid sweep-spam.
- **`failedPayload(payment, refund, failureReason, final)`** — Builds the `payment.refund_failed` event payload.
- **`recordRefundFailure(payment, refund, failureReason)`** — Records a provider refusal: increments attempt, schedules next retry, and (only when the failure is new) appends a timeline row and emits `payment.refund_failed`, all in one transaction.

## Relationships

- **`@domain-primitives/money`** — `toMinorUnits`, `subtractMoney`, and the `Money` type underpin all amount arithmetic in `remainingOf`, `isFullyRefunded`, and `refundedPayload`.
- **`@kernel/outbox`** — `announceInTransaction` is the wrapper that makes the outbox row commit atomically with the settlement writes in both `settleRefund` and `recordRefundFailure`.
- **`@kernel/events`** — `DomainEventMap` types shape the `refundedPayload` and `failedPayload` return types.
- **`@modules/orders`** — `orderService.markPaymentStatus` and `orderService.appendTimeline` are called inside the settlement/failure transaction; this file never imports the orders service for reads, only for these two writes.
- **`@modules/access`** — `ownOrderFlag` is embedded in the audit metadata to flag whether the operator is acting on their own order.
- **`@infrastructure/adapters/logger`** — Emits the info-level log line in `announceRefund`.
- **`@infrastructure/observability/audit`** — `recordAudit` writes the admin audit row in `announceRefund`.
- **`../domain`** (payments domain barrel) — `isOpenRefund`, `lostToChargebacks`, `nextRefundAttemptAt`, and `isFinalFailure` provide the status predicates and retry-backoff logic.
- **`../config`** — `paymentEffectRetryMinutes()` supplies the retry interval passed to `nextRefundAttemptAt`.
- **`../audit`** — `paymentsAuditActions` constants name the audit rows.
- **`../events`** — `PAYMENT_REFUNDED`, `PAYMENT_REFUND_FAILED` event-name strings used in outbox announcements.

## Notes

- **Idempotence via conditional write.** `settleRefund` relies on the repository's conditional update: a racing caller (e.g., the sweep) finds the record already `succeeded` and gets `null`, so the outbox row and announcement fire exactly once. There is no separate dedup mechanism.
- **`isFullyRefunded` uses `<=` deliberately.** An external refund can push the cumulative total past the original payment amount; that is still "everything back."
- **`refundedPayload` is built even for `outcome: 'failure'`.** A corrupted-row settlement still produces a `payment.refunded` event because downstream `invoicing` issues a credit note regardless of the internal flag.
- **`stampOrder` is transactional, not best-effort.** It commits with the settlement or not at all; there is no later repair path for a missed stamp after the final refund.
- **Sweep-spam guard.** `isNewFailure` suppresses duplicate timeline rows and events when the sweep retries the same refusal reason every `paymentEffectRetryMinutes` interval.
- **Stryker markers.** The `Stryker disable/restore all` comments around the logger block in `announceRefund` exclude it from mutation testing (logging has no observable side-effect to test).
