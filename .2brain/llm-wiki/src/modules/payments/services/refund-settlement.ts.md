---
source: src/modules/payments/services/refund-settlement.ts
source_sha256: 114dbb847347c08a3e0a1686e8cd6b5f84c794fe1ab7fb32bf3d3279a6b59bdd
context_sha256: 732dfd6ef6268b39517d4bc210f0824bf7e41df352e4c098a8676c2309e8ea32
generated_at: 2026-11-22T06:52:20.421293+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/services/refund-settlement.ts

## Purpose
Defines how a refund record ends. It holds the writes that settle a refund (record goes `succeeded`, the order is stamped, and `payment.refunded` goes to the outbox) and the writes that record a provider refusal. It was split out of `refunds.ts` so the flows that send refunds (`./refunds.ts`) and the flows that reach a record from the provider's side (`./refund-sync.ts`) can share this code without importing each other.

## Key elements
- `remainingOf(payment)`: refundable amount in minor units. It is the amount paid, minus the amount refunded (pending refunds count), minus what lost chargebacks took.
- `refundRow(refund)`: builds the timeline row data (refund id, padded amount, currency, closed reason code). It never includes the provider's wording.
- `isFullyRefunded(payment)`: true when `remainingOf` is `<= 0` and no refund is still open.
- `announceRefund(payment, refund, context, outcome, byHand)`: writes the log line and the audit row. The audit action differs for hand-settled refunds. The `ownOrderFlag` is added to the audit metadata.
- `refundedPayload(payment, refund)`: builds the `payment.refunded` event payload. It includes `returnId` and goods lines with shipping when present, and a `full` flag.
- `stampOrder(payment, session)`: calls `orderService.markPaymentStatus` with `refunded` or `partially_refunded`, inside the settlement transaction.
- `settleWithin(payment, refund, fields, session, actor?)`: settles inside a transaction the caller owns, using `announceWithin`. The caller must nudge the outbox after commit.
- `settleRefund(payment, refund, fields, context, outcome = 'success')`: settles in its own transaction via `announceInTransaction`. If it settled, it then calls `announceRefund`. It returns `null` when another caller settled the record first.
- Internal helpers:
  - `writeSettlement` runs `paymentRepository.settleRefund`, then `stampOrder`, then appends a `refund_settled` timeline entry.
  - `refundedAnnouncement` builds the outbox announcement. Its `aggregateId` is the order id.
  - `isNewFailure` is true on the first attempt or when the failure reason changed.
  - `failedPayload` builds the `payment.refund_failed` payload.
- The refusal-recording function is cut off in the provided source, so it is not described here.

## Relationships
- `@modules/orders` (`orderService`): `markPaymentStatus` and `appendTimeline` run inside the settlement session.
- `@kernel/outbox`: `announceInTransaction` and `announceWithin` commit the event with the writes. `OutboxAnnouncement` types it.
- `@kernel/events`: `DomainEventMap` types the event payloads this file builds.
- `../events`: provides the `PAYMENT_REFUNDED`, `PAYMENT_REFUND_FAILED` and `PAYMENT_REFUND_REVERSED` constants.
- `@domain-primitives/money`: `padDecimal`, `toMinorUnits`, `subtractMoney` and `Money`.
- `@infrastructure/observability/audit` (`recordAudit`) and `../audit` (`paymentsAuditActions`): audit rows.
- `@infrastructure/adapters/logger`: logging.
- `@modules/access` (`ownOrderFlag`): adds an ownership flag to audit metadata.
- `../domain`: provides `isOpenRefund`, `lostToChargebacks`, `isFinalFailure`, `nextRefundAttemptAt` and `OPEN_REFUND_STATUSES`.
- `../config`: `paymentEffectRetryMinutes`.
- `../model`: `PaymentDocument`, `RefundRecord`, `RefundSettlement`.

## Notes
- The conditional repository write is what makes settlement idempotent. A racing caller, such as the sweep against a request, gets `null`, so the announcement fires once.
- The `payment.refunded` outbox row and the order stamp commit with the settlement. Nothing later repairs a missed stamp.
- `refundedPayload` is built even for `outcome: 'failure'` (the corrupted-row case). `invoicing` cannot tell the difference, and a credit note is owed either way.
- Audit happens only when `context` is present, meaning an admin request.
- `isFullyRefunded` uses `<=` because an outside refund can push the total past the amount paid.
- `isNewFailure` limits timeline rows, because the sweep retries a stuck refund every few minutes.
- The logger calls are wrapped in `Stryker disable/restore` mutation-testing markers.
