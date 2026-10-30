---
source: src/modules/invoicing/audit.ts
sha256: ef5f092e40e116c3eb5521605e7398d8a08631c00dae4c7307e23f17f0f12d57
generated_at: 2026-10-29T04:09:53.524936+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/audit.ts

## Purpose

Declares the audit action strings the invoicing module emits and registers them in the global `AuditActionMap` via TypeScript module augmentation. Exists so that any code path that produces an invoicing audit event can reference a typed, module-scoped constant instead of a raw string literal.

## Key elements

- **`invoicingAuditActions`** (exported const) — Maps event names to their audit action strings:
  - `ADMIN_INVOICE_VIEWED` → `'admin.invoice.viewed'`
  - `ADMIN_CREDIT_NOTE_VIEWED` → `'admin.credit_note.viewed'`
- **`declare module '@infrastructure/observability/audit'`** — Augments `AuditActionMap` with an `invoicing` key typed as the union of the values above, making the strings available to the infrastructure audit layer in a type-safe way.

## Relationships

- **`src/modules/invoicing/controllers/get-order-invoice.ts`** — Consumes `ADMIN_INVOICE_VIEWED` when a staff member downloads an invoice PDF belonging to another user.
- **`src/modules/invoicing/controllers/get-order-credit-note.ts`** — Consumes `ADMIN_CREDIT_NOTE_VIEWED` when a staff member downloads a credit-note PDF.

## Notes

- The `admin.` prefix on both action strings is a convention meaning "only produced by staff actions" (as opposed to user-initiated events).
- Actions are declared via module augmentation rather than a shared enum; the JSDoc header points to `modules/account/audit.ts` for the rationale behind that choice.
- This file contains no runtime logic — it is purely type-level and a string registry.
