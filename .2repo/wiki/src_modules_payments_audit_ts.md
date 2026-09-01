# src/modules/payments/audit.ts

## Purpose

Declares the set of audit action identifiers emitted by the payments module and registers them in the shared `AuditActionMap` via TypeScript module augmentation, giving the observability layer a typed vocabulary of payment-related audit events.

## Key elements

- **`paymentsAuditActions`** — `as const` object with three keys/values:
  - `PAYMENT_CONFIRMED` → `'payment.confirmed'`
  - `PAYMENT_FAILED`` → `'payment.failed'`
  - `ADMIN_PAYMENT_REFUNDED` → `'admin.payment.refunded'`
- **Module augmentation** (`declare module '@infrastructure/observability/audit'`) — extends `AuditActionMap` with a `payments` key whose type is the union of the three action strings.

## Relationships

- **`src/modules/payments/service.ts`** — Consumer of these constants. The service's confirm, fail, and refund flows emit the corresponding `paymentsAuditActions` values through the observability audit pipeline.

## Notes

- The `admin.` prefix on `ADMIN_PAYMENT_REFUNDED` is intentional: refund is gated to admin actors, whereas confirm/fail can originate from any checkout. The prefix is a convention, not enforced by the type system.
- `refundForOrder` (the cancel-listener compensation path) deliberately does **not** use an audit action; it logs directly, matching the pattern used by the token-cleanup job.
- The module-augmentation pattern here mirrors `src/modules/account/audit.ts`; see that file for the broader rationale.
