---
source: src/modules/invoicing/audit.ts
sha256: 50c5b148d1bf2d42b84beb8140f7e97c53c6f57e13b47c4ab2f8a0f71ddbd438
generated_at: 2026-10-15T10:37:33.323523+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/audit.ts

## Purpose

Declares the audit action strings the invoicing module can emit and registers them into the shared `AuditActionMap` via TypeScript module augmentation. This provides compile-time safety so that only recognized action keys can be logged for this module, while keeping each module's vocabulary local rather than centralized in a shared enum.

## Key elements

- **`invoicingAuditActions`** — `as const` object of action strings this module fires. Currently defines a single key:
  - `ADMIN_INVOICE_VIEWED` (`'admin.invoice.viewed'`) — emitted when staff download/view another user's invoice PDF (financial + personal data egress).
- **`declare module '@infrastructure/observability/audit'`** — Augments `AuditActionMap` with an `invoicing` field typed to the union of `invoicingAuditActions` values, making those strings the only valid audit-action keys accepted for this module at call sites.

## Relationships

- **`src/modules/invoicing/controllers/get-order-invoice.ts`** — Consumes `invoicingAuditActions` (specifically `ADMIN_INVOICE_VIEWED`) to record the audit event when a staff member retrieves another user's invoice.

## Notes

- The `admin.` prefix on action strings is a convention indicating the event is only produced by staff, not by end-users. Any new non-staff action should omit this prefix.
- The augmentation pattern is deliberate: each module owns its action vocabulary locally (see `modules/account/audit.ts` for the same pattern) instead of importing from a shared enum. Add new actions to the object, not to the augmentation block.
