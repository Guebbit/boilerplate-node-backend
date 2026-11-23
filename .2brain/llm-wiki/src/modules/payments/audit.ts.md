---
source: src/modules/payments/audit.ts
source_sha256: 2d3baee13d511814b826a274f463ccf0db5075434d791ece446ef4cfb9230a3e
context_sha256: 63945c8ee8388d31cfa98a08784503233e688a3e38b719b4de044d8052447ea7
generated_at: 2026-11-22T06:40:26.771771+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/audit.ts

## Purpose
Declares the audit action strings the payments module emits and registers them with the shared audit type system. It also flags the one action that counts as a security event. Per the file header, it follows the same augmentation pattern as `src/modules/account/audit.ts`.

## Key elements
- `paymentsAuditActions` — a `const` map from event key to action string:
  - `PAYMENT_CONFIRMED` → `payment.confirmed`
  - `PAYMENT_FAILED` → `payment.failed`
  - `ADMIN_PAYMENT_REFUNDED` → `admin.payment.refunded`. This is the settlement of a provider refund, which a sweep never audits.
  - `ADMIN_PAYMENT_REFUND_REQUESTED` → `admin.payment.refund_requested`. Written when a refund record opens, before the provider is asked.
  - `ADMIN_PAYMENT_REFUND_SETTLED_BY_HAND` → `admin.payment.refund_settled_by_hand`. An operator confirmed the money went back outside the app, via `settleRefundByHand` or `paidOutside`.
  - `ADMIN_PAYMENT_REFUND_CANCELED` → `admin.payment.refund_canceled`. Staff voided a refund through `cancelRefund`. This is the only audit row for that case.
  - `PAYMENT_RECORDED_OFFLINE` → `payment.recorded_offline`
  - `PAYMENT_REFUND_OWED_BY_HAND` → `payment.refund_owed_by_hand`. A refund record opened on a hand-paid payment and left `pending` for an operator.
  - `PAYMENT_AMOUNT_MISMATCH` → `payment.amount_mismatch`. The provider reported `succeeded` for a different amount, currency or payment than the one frozen on the payment.
  - `SECURITY_PAYMENT_WEBHOOK_INVALID_SIGNATURE` → `security.payment_webhook.invalid_signature`. A provider webhook whose signature did not verify.
- `registerSecurityEvents([...])` call (runs at import time) — registers only `SECURITY_PAYMENT_WEBHOOK_INVALID_SIGNATURE` as a security event, so it is counted.
- `declare module '@infrastructure/observability/audit'` — augments `AuditActionMap` with a `payments` key. Its type is the union of the values of `paymentsAuditActions`.

## Relationships
- `src/infrastructure/observability/security-events.ts` — provides `registerSecurityEvents`, which this file calls.
- `src/infrastructure/observability/audit` — the module whose `AuditActionMap` is augmented here.
- The other neighbors are the payments services, the webhook controller and the integration tests. This file does not import them. The comments name `refundForOrder`, `settleRefundByHand`, `cancelRefund` and `paidOutside` as emitters, but the file does not show which neighbor contains each.

## Notes
- Naming conventions:
  - `admin.` marks the refund because it is genuinely admin-only, unlike confirm/fail, which any checkout can produce.
  - `PAYMENT_RECORDED_OFFLINE` is also admin-only but keeps the `payment.` prefix, because it names a kind of payment event rather than an admin override.
- `PAYMENT_AMOUNT_MISMATCH` is deliberately not under `security.`. The incident view takes that whole prefix, and a mismatch is a money discrepancy to reconcile, not an attack signal.
- `refundForOrder` (the refund half of the `order.canceled` listener) logs real-provider refunds instead of auditing them, because there is no request behind it, as with a sweep. It still audits `PAYMENT_REFUND_OWED_BY_HAND` when a hand-paid refund is left for an operator.
- `PAYMENT_REFUND_OWED_BY_HAND` is written for every way a record opens: a cancel, a late payment on a canceled order, an operator's refund, a received return and a buyer's withdrawal.
