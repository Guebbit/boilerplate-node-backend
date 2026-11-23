---
source: src/modules/invoicing/audit.ts
source_sha256: ef5f092e40e116c3eb5521605e7398d8a08631c00dae4c7307e23f17f0f12d57
context_sha256: 2c32036601396d63c8b9f9f98fff444bc65548fd2629055ec5c3029b33712547
generated_at: 2026-11-22T05:29:15.057783+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/audit.ts

## Purpose
Declares the audit action strings the invoicing module emits, and registers them with the infrastructure audit system through TypeScript module augmentation. This avoids a shared enum of all actions (the rationale is documented in `src/modules/account/audit.ts`). The `admin.` prefix marks actions only staff produce.

## Key elements
- `invoicingAuditActions`: a `const` object mapping event keys to action strings:
  - `ADMIN_INVOICE_VIEWED` → `'admin.invoice.viewed'`: staff downloaded someone else's invoice PDF.
  - `ADMIN_CREDIT_NOTE_VIEWED` → `'admin.credit_note.viewed'`: staff downloaded someone else's credit-note PDF, which carries the same buyer address.
- `declare module '@infrastructure/observability/audit'`: augments `AuditActionMap` with an `invoicing` key. Its type is the union of the values of `invoicingAuditActions`.

## Relationships
- The `get-order-invoice.ts` and `get-order-credit-note.ts` controllers are the neighbors. Their names and the action descriptions match the invoice and credit-note PDF downloads, so they are presumably the places these actions are fired. This file does not show that usage.
- Depends on `@infrastructure/observability/audit` for the `AuditActionMap` interface it extends.

## Notes
- The `as const` assertion is what makes the augmented type a union of literal strings rather than `string`. Adding a new action to the object automatically widens the `invoicing` entry in `AuditActionMap`.
- The file has no runtime logic beyond the constants. The augmentation exists only at the type level.
