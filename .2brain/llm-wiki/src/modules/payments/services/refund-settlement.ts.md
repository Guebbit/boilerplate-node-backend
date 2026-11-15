---
source: src/modules/payments/services/refund-settlement.ts
sha256: 691b061e833e5abfbbc3a778eaf7058c22fa091f01578ae672f90087ea4c0b4f
generated_at: 2026-11-14T21:08:34.416520+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/refund-settlement.ts

## Purpose

Terminal-state writer for refund records. Given a payment and an open refund, it either settles the refund to `succeeded` (stamping the order's payment status, appending a timeline row, and emitting the refund-settled domain event in the outbox) or records a provider refusal as `failed` (incrementing the attempt counter, scheduling the next retry, and optionally emitting the refund-failed domain event). It was split out of `refunds.ts` so that `refund-sync.ts` (provider-side flows) and `refunds.ts` (initiation-side flows) can share settlement logic without importing each other.

## Key elements

- **`remainingOf(payment)`** — Computes the still-refundable amount in minor units: paid − already-refunded (pending counts) − amount lost to chargebacks.
- **`refundRow(refund)`** — Shapes the `OrderTimelineDataRefund` payload (id, padded amount, currency, reason code). Never includes provider free-text.
- **`isFullyRefunded(payment)`** — True when `remainingOf ≤ 0` **and** no refund record is still open. Uses `<=` deliberately so an outside refund that overshoots the paid amount still counts as full.
- **`refundedPayload(payment, refund)`** — Builds the domain-event payload for the refund-settled event (consumed by invoicing and webhooks). Includes optional `goods` lines and a `full` flag.
- **`stampOrder(payment, session)`** — Calls `orderService.markPaymentStatus` (`refunded` | `partially_refunded`) inside the settlement transaction.
- **`settleRefund(payment, refund, fields, context, outcome?)`** — Primary success-path entry. Wraps the repository write + order stamp + timeline append + outbox announcement in a single `announceInTransaction` call. Returns the updated payment, or `null` if a concurrent caller already settled the record.
- **`recordRefundFailure(payment, refund, failureReason)`** — Primary failure-path entry. Increments `attempts`, schedules `nextAttemptAt` via `nextRefundAttemptAt`, and (only for a *new* failure) appends a timeline row and emits the refund-failed event.
- **`writeSettlement`** (internal) — Sequences `paymentRepository.settleRefund` → `stampOrder` → `orderService.appendTimeline` within one session.
- **`announceRefund`** (internal) — Writes the structured log line and the audit row (admin-only audit via `CallerContext`).
- **`isNewFailure`** (internal) — Suppresses duplicate failure timeline rows: only the first attempt or a *different* reason than the previous one produces a row.
- **`failedPayload`** (internal) — Builds the refund-failed event payload including a `final` flag.

## Relationships

- **`src/domain-primitives/money.ts`** — `padDecimal`, `toMinorUnits`, `subtractMoney`, and the `Money` type underpin all arithmetic in `remainingOf`, `refundRow`, and `refundedPayload`.
- **`src/kernel/outbox.ts`** — `announceInTransaction` guarantees the domain-event row commits atomically with the settlement writes (or not at all).
- **`src/kernel/events.ts`** — `DomainEventMap` provides the typed payload shapes used by both the success and failure event builders.
- **`src/modules/orders/index.ts`** / **`src/modules/orders/services/index.ts`** — `orderService.markPaymentStatus` and `orderService.appendTimeline` are called inside the settlement transaction; `orders` never polls back into payments.
- **`src/modules/access/index.ts`** / **`src/modules/access/domain/protection.ts`** — `ownOrderFlag` enriches the audit metadata with whether the acting operator owns the order.
- **`src/modules/payments/audit.ts`** — `paymentsAuditActions` enum values for the audit row.
- **`src/modules/payments/config.ts`** — `paymentEffectRetryMinutes()` feeds the backoff calculation in `nextRefundAttemptAt`.
- **`src/modules/payments/domain/index.ts`** (incl. `lifecycle.ts`, `disputes.ts`) — `isOpenRefund`, `isFinalFailure`, `lostToChargebacks`, `nextRefundAttemptAt`, `OPEN_REFUND_STATUSES`.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` persists the audit trail.
- **`src/infrastructure/adapters/logger.ts`** — Structured info-level log in `announceRefund`.
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** — Appears as a graph neighbor; likely exercises settlement outcomes in delivery-side test fixtures.

## Notes

- **Idempotence is structural, not advisory.** The repository write is conditional on the refund still being open; a racing second caller receives `null` and skips the announcement. No lock or flag is needed.
- **Outbox is not fire-and-forget.** The refund-settled event row is written inside the same transaction as the status change. A crash after the write but before commit rolls back both.
- **`refundedPayload` is built even when `outcome === 'failure'`** (corrupted-row settlement). Invoicing issues a credit note regardless; it cannot distinguish the two.
- **`stampOrder` is transactional, not compensating.** If it fails, the settlement rolls back. There is no later repair path for a missed order stamp.
- **Failure timeline dedup.** The sweep retries a stuck refund every few minutes; `isNewFailure` ensures only the first attempt or a reason *change* writes a timeline row, avoiding a wall of identical entries.
- **`Stryker disable all`** brackets the `logger.info` call in `announceRefund`, exempting that line from mutation testing.
- **`refund.attemptedAt!`** is asserted non-null in `recordRefundFailure` on the assumption that this code path only processes records it opened or claimed. A record without `attemptedAt` would crash here.
