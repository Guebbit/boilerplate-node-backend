---
source: src/modules/returns/audit.ts
sha256: 53bc4c6f01611339a4003268732eeec0ecc9e0de6df00e8be033b4e4bfcd6970
generated_at: 2026-10-29T05:35:37.474174+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/audit.ts

## Purpose

Defines the set of audit action strings emitted by the returns module and registers them in the infrastructure audit type map via TypeScript module augmentation. This keeps the returns module's audit vocabulary in one place so every service that records an event uses a stable, typed identifier.

## Key elements

- **`returnsAuditActions`** – A `const` object of seven string literals (e.g. `RETURN_REQUESTED`, `ADMIN_RETURN_CLOSED`). The `admin.` prefix distinguishes staff-only actions from customer-facing ones.
- **Module augmentation (`declare module '@infrastructure/observability/audit'`)** – Extends `AuditActionMap` with a `returns` key whose type is the union of all action strings, giving callers compile-time safety.

## Relationships

- **`services/cancel.ts`, `services/close.ts`, `services/decide.ts`, `services/receive.ts`, `services/outcome.ts`** – Each service imports `returnsAuditActions` and passes the relevant action string when it records an audit event (e.g. `decide.ts` fires `ADMIN_RETURN_APPROVED` or `ADMIN_RETURN_DECLINED`; `cancel.ts` fires `ADMIN_RETURN_CANCELED`).
- **`controllers/get-return-by-id.ts`** – Fires `ADMIN_RETURN_VIEWED` when staff open a return detail.
- **`tests/integration/service.test.ts`** – Asserts that the correct audit action strings are emitted by the services above.

## Notes

- The `admin.` prefix is a naming convention, not a runtime gate; authorization is enforced elsewhere.
- The augmentation pattern (rather than a shared enum) mirrors `modules/account/audit.ts`; see that file for the rationale.
- Action strings are the source of truth for downstream audit-log filtering; renaming one here is a breaking change for any query or dashboard that references the old string.
