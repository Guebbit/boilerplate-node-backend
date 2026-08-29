# src/modules/payments/audit.ts

## Purpose

Declares the audit action vocabulary for the payments module and registers it into the global `AuditActionMap` via TypeScript module augmentation. It exists so that every way money moves in the system has a named, type-safe audit action, even when the action is emitted through logging rather than a structured audit event.

## Key elements

- **`paymentsAuditActions`** — A `const` object of three string-literal action keys:
  - `PAYMENT_CONFIRMED` (`payment.confirmed`)
  - `PAYMENT_FAILED` (`payment.failed`)
  - `ADMIN_PAYMENT_REFUNDED` (`admin.payment.refunded`)
- **Module augmentation** (`declare module '@infrastructure/observability/audit'`) — Adds a `payments` key to `AuditActionMap`, typed to the union of the values above. Follows the same augmentation pattern as `modules/account/audit.ts`.

## Relationships

- **`src/modules/payments/service.ts`** — The service that performs the confirm/fail/refund operations and is the expected consumer of these action constants when emitting audit entries.

## Notes

- The `admin.` namespace prefix on `ADMIN_PAYMENT_REFUNDED` is intentional: refunds are triggered exclusively by an admin path, unlike `confirmed`/`failed` which any checkout flow can produce.
- The refund action is listed for vocabulary completeness even though, per the file's own comment, the refund path currently **logs instead of auditing** (no request context to build an event from). If you see `admin.payment.refunded` in code, verify whether it is actually emitting an audit event or just a log line.
- Actions are declared by augmentation rather than a shared enum — the rationale for this pattern is documented in `modules/account/audit.ts`.
