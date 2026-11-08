---
source: src/modules/payments/services/refund-settlement.ts
sha256: b28e55f4b3fe0b17bf9e9a3ab8bf9c54f3f347714a4980e27e3848238305729f
generated_at: 2026-11-08T07:28:19.623471+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/refund-settlement.ts

## Purpose

Shared settlement logic for refund records that reaches a terminal state: either the provider confirms the refund (status → `succeeded`, order stamped, `payment.refunded` outbox row committed) or the provider refuses it (status → `failed`, attempt counted). Split out of `refunds.ts` so that the provider-side sync flow (`./refund-sync.ts`) and the operator-driven send flow (`./refunds.ts`) can both call these functions without importing each other.

## Key elements

- **`remainingOf(payment)`** — Computes refundable balance in minor units: paid amount minus `amountRefunded` minus amounts lost to chargebacks.
- **`refundRow(refund)`** — Shapes a refund into the order-timeline data (`refundId`, padded `amount`, `currency`, `reason`). Deliberately excludes provider-facing wording.
- **`isFullyRefunded(payment)`** — True when `remainingOf ≤ 0` **and** no refund record is still open. The `≤` tolerates overshoot from outside refunds.
- **`announceRefund(payment, refund, context, outcome, byHand)`** — Post-commit side-effects only: one `logger.info` line and one `recordAudit` row (admin-only when `context` is present). The `payment.refunded` event itself is **not** emitted here.
- **`refundedPayload(payment, refund)`** — Builds the `payment.refunded` domain-event payload (amount, lines/shipping when present, `full` flag). Constructed even for the corrupted-row (`outcome: 'failure'`) case because downstream `invoicing` cannot distinguish and still owes a credit note.
- **`stampOrder(payment, session)`** — Calls `orderService.markPaymentStatus` with `refunded` or `partially_refunded` inside the caller's transaction.
- **`writeSettlement(payment, refund, fields, session, actor?)`** — Atomic write sequence in one session: `paymentRepository.settleRefund` → `stampOrder` → `orderService.appendTimeline`. Returns the final payment document or `null` if the record was no longer open.
- **`settleRefund(payment, refund, fields, context, outcome?)`** — Public entry point. Wraps `writeSettlement` in `announceInTransaction` so the `payment.refunded` outbox row commits atomically. The conditional repository write is the idempotence guard: a racing caller sees `null` and skips the announcement. After commit, calls `announceRefund`.
- **`isNewFailure(refund, failureReason)`** — True on first attempt or when the reason differs from the last recorded failure; suppresses duplicate timeline rows from the retry sweep.
- **`failedPayload(payment, refund, failureReason, final)`** — Builds the `payment.refund_failed` event payload (includes `final` flag).
- **`recordRefundFailure(payment, refund, failureReason)`** — Public entry for provider refusal. Increments `attempts`, computes `nextAttemptAt` via `nextRefundAttemptAt`, and (if `isNewFailure`) appends a timeline row and announces `payment.refund_failed` — all in one transaction. Only the current attempt can transition the record, preventing a late error from overwriting a newer state.

## Relationships

- **`src/domain-primitives/money.ts`** — Uses `padDecimal`, `toMinorUnits`, `subtractMoney`, and the `Money` type for all arithmetic and display formatting.
- **`src/infrastructure/adapters/logger.ts`** — Emits structured info logs in `announceRefund`.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` is called in `announceRefund` for the admin audit trail.
- **`src/kernel/events.ts`** — `DomainEventMap` type parameterises the payload builders (`refundedPayload`, `failedPayload`).
- **`src/kernel/outbox.ts`** — `announceInTransaction` guarantees the `payment.refunded` / `payment.refund_failed` outbox rows commit in the same transaction as the domain writes.
- **`src/modules/access/index.ts`** — `ownOrderFlag` enriches audit metadata with whether the caller owns the order.
- **`src/modules/orders/index.ts`** — `orderService.markPaymentStatus` and `orderService.appendTimeline` are called inside the settlement transaction to keep the order's `paymentStatus` and timeline consistent.
- **`src/modules/payments/audit.ts`** — Provides the `paymentsAuditActions` enum values used in audit rows.
- **`src/modules/payments/config.ts`** — `paymentEffectRetryMinutes` feeds the back-off calculation in `recordRefundFailure`.
- **`src/modules/payments/domain/index.ts`** — Re-exports the domain helpers this file relies on: `isFinalFailure`, `isOpenRefund`, `lostToChargebacks`, `nextRefundAttemptAt`, `OPEN_REFUND_STATUSES` (backed by `disputes.ts` and `lifecycle.ts`).

## Notes

- **Idempotence is structural, not advisory.** `settleRefund` depends on `paymentRepository.settleRefund` being a conditional write (only transitions from an open status). A second caller receives `null` and does nothing further. Do not add a pre-check `isOpenRefund` guard around the call — the conditional write is the guard.
- **Outbox-before-announce ordering.** The domain event row commits inside `announceInTransaction`; the log line and audit row (`announceRefund`) fire *after* the transaction resolves. If the process crashes between commit and announce, the event is still durable but the log/audit row is lost.
- **`refundedPayload` is always built**, even when `outcome` is `'failure'` (corrupted-row path). Downstream consumers (`invoicing`, `webhooks`) have no `outcome` field to inspect.
- **`stampOrder` is in-transaction.** It runs inside the same Mongoose session as the refund write, not after commit. A missed stamp would not be repaired later, so atomicity is intentional.
- **`recordRefundFailure` is attempt-scoped.** The repository's `failRefund` only mutates the record if it matches the current attempt, so a stale provider callback cannot overwrite a refund that already succeeded or a newer attempt.
- The Stryker mutation-testing annotations (`Stryker disable/restore all`) around the `logger.info` block in `announceRefund` suppress mutation testing for that string-literal branch; do not remove them without coordinating with the mutation-testing config.
