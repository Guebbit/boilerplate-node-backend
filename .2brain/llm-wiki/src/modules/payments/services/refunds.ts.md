---
source: src/modules/payments/services/refunds.ts
sha256: 9b08bbce8014b55b7e62a354d6457c8dc56386a72ab2968834a38b2bf75c8c99
generated_at: 2026-10-29T05:13:14.883477+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/refunds.ts

## Purpose

The sole mechanism for moving money out of a payment. Exposes the operator-facing `refundPayment` action and the `order.cancelled` listener's compensation (`refundForOrder`), both funnelled through `performRefund`. A refund is a conditional write on the payment document that reserves the amount, then asks the provider; the record settles only on provider confirmation.

## Key elements

- **`RefundRequest`** — input shape: `amount` (decimal, absent = everything left), `reason`, optional `returnId` / `lines` / `shipping`, and `capAtRemaining` (clamp instead of reject).
- **`CANCELLATION_REQUEST` / `LATE_PAYMENT_REQUEST`** — frozen `RefundRequest` constants for the two automatic callers.
- **`openRefund`** *(exported)* — the core primitive. One conditional write that appends the `RefundRecord` **and** raises `amountRefunded`; a miss means a racing writer moved the amount, so the payment is re-read and the check re-runs. Commits the order's timeline row in the same transaction.
- **`leaveForOperator`** — hand-paid path: opens the refund, logs a warning, records the audit row, and leaves the record `pending` for an operator's later `settleRefundByHand`. No caller settles on the spot.
- **`announceOwedByHand`** — enqueues a `PAYMENT_REFUND_OWED_BY_HAND` outbox event (only for hand-recorded payments) inside the opening transaction.
- **`recordOwedByHand`** *(exported)* — writes a `recordAudit` row naming the order, refund, and amount so a person knows cash/transfer is owed outside the app.
- **`failureReasonOf`** — maps a rejected provider call to a `RefundFailureReason`; distinguishes "no answer" (timeout / 5xx) from "refused" in the log line. Provider wording is logged (truncated to 500 chars) but never persisted.
- **`OpenedRefund` / `RefundOutcome`** — return types carrying the post-write payment, the refund id, and a `leftOpen` flag.

## Relationships

| Neighbor | Interaction |
|---|---|
| `domain-primitives/money.ts` | All arithmetic on money goes through its helpers (`toMinorUnits`, `addMoney`, `subtractMoney`, `minMoney`, `fitsCurrency`, `toDecimalAmount`). |
| `infrastructure/runtime/database.ts` | `withTransaction` wraps the conditional write so the refund row and the order-timeline commit atomically. |
| `kernel/outbox.ts` | `enqueueOutboxEvent` / `announceInTransaction` publish `PAYMENT_REFUND_OWED_BY_HAND`; `nudgeOutbox` pokes delivery. |
| `kernel/permissions.ts` | `systemCallerContext` identifies the system actor for automatic (listener-initiated) refunds. |
| `kernel/ability.ts` | `holds` checks whether the caller may refund a given payment. |
| `kernel/events.ts` | `DomainEventMap` type for event payloads. |
| `infrastructure/observability/audit.ts` | `recordAudit` writes the audit row for every opened refund and for the owed-by-hand record. |
| `infrastructure/observability/forbidden.ts` | `auditForbidden` logs a denied refund attempt. |
| `infrastructure/http/response.ts` | `fieldError`, `generateSuccess`, `generateReject` shape the API response for the operator endpoint. |
| `infrastructure/i18n/index.ts` | `t` provides localised error/success messages. |
| `infrastructure/adapters/logger.ts` | `logger.warn` for provider-refusal and hand-paid warnings. |
| `modules/access/index.ts` | `ownOrderFlag` gates whether the caller may touch this specific order's payment. |

## Notes

- **Provider dispatch is per-payment, not per-deployment.** The provider is read from the payment row itself, so a refund always goes back to the PSP that actually took the money, even if the deployment has since switched providers.
- **`manual` / hand-recorded payments have no provider call.** They skip the provider step entirely; the record stays `pending` until an operator explicitly settles it.
- **The payment's `status` stays `succeeded` regardless of how much is refunded.** The derived `displayStatus` reads `refunded` only when the records' amounts sum to the full `amount`.
- **Double-refund protection** is the conditional write's `amountRefunded` guard, not a separate lock or state flag.
- **`capAtRemaining: true`** (used by the automatic cancellation path) clamps the refund to what is actually left rather than rejecting, guarding against a racing refund that already consumed part of the remainder.
- **A failed provider call does not delete the record.** It marks it `failed` (still an "open" status) so the sweep retries with the **same** idempotency key.
