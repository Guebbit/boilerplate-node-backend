---
source: src/modules/invoicing/audit.ts
sha256: ef5f092e40e116c3eb5521605e7398d8a08631c00dae4c7307e23f17f0f12d57
generated_at: 2026-11-08T06:09:16.222525+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/audit.ts

## Purpose

Declares the audit action strings the invoicing module emits and registers them in the infrastructure audit-action map via TypeScript module augmentation. This keeps the set of valid actions for `invoicing` type-safe across the codebase without requiring a shared enum (the same pattern is used in `modules/account/audit.ts`).

## Key elements

- **`invoicingAuditActions`** – A `const` object of two action strings:
  - `ADMIN_INVOICE_VIEWED` (`'admin.invoice.viewed'`) – staff downloaded another user's invoice PDF.
  - `ADMIN_CREDIT_NOTE_VIEWED` (`'admin.credit_note.viewed'`) – staff downloaded another user's credit-note PDF.
- **`declare module '@infrastructure/observability/audit'`** – Augments the `AuditActionMap` interface so the `invoicing` key resolves to the union of values above, giving callers a closed set of allowed strings.

## Relationships

- **`src/modules/invoicing/controllers/get-order-invoice.ts`** – Consumes `invoicingAuditActions.ADMIN_INVOICE_VIEWED` when a staff member retrieves an invoice PDF.
- **`src/modules/invoicing/controllers/get-order-credit-note.ts`** – Consumes `invoicingAuditActions.ADMIN_CREDIT_NOTE_VIEWED` when a staff member retrieves a credit-note PDF.

## Notes

- The `admin.` prefix is a naming convention indicating the action is only ever produced by staff actions (not by the customer-facing flow).
- The augmentation approach (rather than a shared enum) is intentional; see the comment referencing `modules/account/audit.ts` for the rationale. If you add a new action string, append it to `invoicingAuditActions` and the `AuditActionMap` picks it up automatically via the `typeof` utility.
