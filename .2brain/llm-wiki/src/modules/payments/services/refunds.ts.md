---
source: src/modules/payments/services/refunds.ts
sha256: c514decdcd62af84d7ae3ac2b3c01974bf0f88afbb2913b453988907ff3c7eae
generated_at: 2026-09-23T19:21:43.585425+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/refunds.ts

## Purpose
The single money-out path in the payments module. Provides the operator-initiated refund action (`refundByOrder`) and the `ORDER_CANCELLED` event's compensation (`refundForOrder`), both funneled through one conditional status write (`performRefund`) that guarantees at-most-once semantics. No other file in the module is permitted to move money out.

## Key elements

- **`REFUNDABLE_PAYMENT_STATUS`** — Constant `'succeeded'`; the only status from which a refund can originate.
- **`performRefund(orderId, context?)`** — The one conditional write. Atomically moves a payment from `succeeded` to `refunded` via `updateStatusIfIn`; a second call finds nothing and returns `null`. After the move it branches:
  - `manual` provider → stamps `refundedByHand: true` on the row (no external call).
  - Real provider → calls `resolvePaymentProvider().refund(...)` with the payment's own `providerRef`, amount, and currency.
  - Missing `providerRef` on a `succeeded` row → logs a loud error (corrupted row) but still completes the status move to prevent a second attempt.
- **`refundByOrder(orderId, authContext, context)`** — Admin route handler for `POST /payments/order/:orderId/refund`. Calls `performRefund`; on `null` performs a scoped second read to distinguish 404 (no payment) from 409 (payment exists but not in `succeeded`). Returns a `ResponseSuccess` or `ResponseReject` with i18n'd messages.
- **`refundForOrder(orderId)`** — `ORDER_CANCELLED` event listener. Calls `performRefund` without a caller context; outcome is logged, not audited.

## Relationships

- **`@infrastructure/i18n`** — Translates user-facing success and error messages via `t()`.
- **`@infrastructure/adapters/logger`** — Emits info/error logs for each refund outcome and for the corrupted-row case.
- **`@infrastructure/http/response`** — Wraps results in `generateSuccess` / `generateReject` for the route handler.
- **`@infrastructure/observability/audit`** — `recordAudit` records the admin refund action (only when a `CallerContext` is present, i.e. the operator path).
- **`../audit`** — Supplies `paymentsAuditActions.ADMIN_PAYMENT_REFUNDED` as the audit action identifier.
- **`../providers`** — `resolvePaymentProvider()` provides the PSP adapter whose `.refund()` is called for non-manual payments.
- **`../repository`** — `paymentRepository.updateStatusIfIn` performs the atomic status transition; `findByOrderId` handles the 404/409 disambiguation read.
- **`../model`** — `PaymentDocument` type for the row shape.
- **`./scope`** — `callerScope(authContext)` restricts the second read to the caller's tenancy.
- **`./settlement.ts`, `./view.ts`, `./index.ts`** — Sibling services in the same barrel; this file is the only one that mutates money out.
- **`../module.ts`** — Wires `refundForOrder` as the `ORDER_CANCELLED` listener and `refundByOrder` onto the admin route.
- **`../tests/integration/service.test.ts`** — Exercises the at-most-once guarantee and the manual/real-provider branches.

## Notes

- **Idempotence is the status move, not a side-effect guard.** `updateStatusIfIn` is the sole concurrency control; no distributed lock or token is used.
- **Provider is read from the payment row, not the deployment config.** A payment made via PSP A is refunded via A even after the deployment switches to PSP B.
- **`refundForOrder` audits nothing.** It is unattended (event-driven), matching the convention of other background compensation jobs (e.g. token cleanup).
- **`refundByOrder` does a second read** after the write to choose between 404 and 409. The write decision is already final; the read only selects the error sentence.
- **Stryker mutators are explicitly disabled** around the logging/audit lines so mutation testing does not flag them as redundant (they are the only observable side-effects on some paths).
