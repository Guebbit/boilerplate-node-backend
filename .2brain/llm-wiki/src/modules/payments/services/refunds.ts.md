---
source: src/modules/payments/services/refunds.ts
sha256: 3508bbbd08b3d38483d60237f9995f04f463a3d6589055a46b592b99bcc5b6af
generated_at: 2026-09-27T15:27:00.194900+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/refunds.ts

## Purpose

The single module responsible for moving money out. It exposes two entry points — the operator's `POST /payments/order/:orderId/refund` and the `ORDER_REFUND_OWED` event listener — both of which funnel through one conditional write (`performRefund`) so that a refund is applied at most once. Nothing else in the payments module may move money out.

## Key elements

- **`REFUNDABLE_PAYMENT_STATUS`** (exported const) — the only status from which a refund can originate (`'succeeded'`).
- **`performRefund(orderId, context?)`** (exported) — the core refund pipeline. Reads the payment by order, bails if not `succeeded`, handles `manual`-provider payments (operator confirms or leaves for an operator), handles the corrupted no-`providerRef` case, otherwise calls the PSP's `refund` with an idempotency key, then performs the conditional `succeeded → refunded` status write.
- **`refundByOrder(orderId, authContext, context)`** (exported) — HTTP handler. Calls `performRefund`; on success returns the payment; on `null` does a second scoped read to distinguish 404 (payment absent) from 409 (payment exists but not refundable).
- **`refundForOrder(orderId)`** (exported) — the `ORDER_REFUND_OWED` listener. Calls `performRefund` without a `context`, then discards the result.
- **`markRefunded`** (internal) — the conditional write via `paymentRepository.updateStatusIfIn`. Returns `null` when the row is no longer `succeeded` (idempotence). Records an audit entry when a `context` is present.
- **`leaveForOperator`** (internal) — for hand-paid refunds triggered by the automatic listener: logs a warning, records a `PAYMENT_REFUND_OWED_BY_HAND` audit row under `SYSTEM_ACTOR`, and returns the payment unchanged.

## Relationships

- **`src/modules/payments/repository.ts`** — `paymentRepository` provides `findByOrderId` (reads) and `updateStatusIfIn` (the conditional write that enforces at-most-once).
- **`src/modules/payments/providers/index.ts`** — `providerNamed(payment.provider)` dispatches the actual PSP refund call. The provider is always the one on the payment document, never a deployment-level default.
- **`src/modules/payments/audit.ts`** — supplies the `paymentsAuditActions` constants (`ADMIN_PAYMENT_REFUNDED`, `PAYMENT_REFUND_OWED_BY_HAND`) used in audit records.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` writes the audit trail entries.
- **`src/kernel/permissions.ts`** — `SYSTEM_ACTOR` and `callerForSubject` build the actor identity for the unattended `leaveForOperator` audit row.
- **`src/modules/payments/services/scope.ts`** — `callerScope(authContext)` scopes the fallback read in `refundByOrder` so the 404-vs-409 check respects caller permissions.
- **`src/infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` shape the HTTP response.
- **`src/infrastructure/i18n/index.ts`** — `t()` localizes the success and rejection messages.
- **`src/infrastructure/adapters/logger.ts`** — structured logging for warnings, info, and error paths.
- **`src/modules/payments/module.ts`** — defines the `ORDER_REFUND_OWED` retry sweep that re-delivers `refundForOrder`; the doc comment here cross-references it.
- **`src/modules/payments/services/index.ts`** — barrel that re-exports the three public functions from this file.

## Notes

- **Idempotency key** is `refund:<payment._id>`, so a redelivered event or a double-click produces the same PSP refund rather than a second one.
- **Provider-first ordering**: the PSP is asked *before* the status moves. A provider rejection leaves the payment in `succeeded`, which is the exact state the `ORDER_REFUND_OWED` sweep can retry against.
- **`context` presence is the caller discriminator**: present → operator call (audited, can confirm a manual refund); absent → automatic listener (cannot confirm a manual refund, leaves it for a human).
- **Corrupted-row path** (a `succeeded` payment with no `providerRef`): the status still moves to `refunded` to prevent infinite retry, but the audit outcome is recorded as `failure` and an error is logged. This is considered unreachable in normal operation.
- **Stryker mutation-testing guards** (`Stryker disable all` / `restore all`) wrap every `logger.*` call so mutation testing doesn't flag them.
