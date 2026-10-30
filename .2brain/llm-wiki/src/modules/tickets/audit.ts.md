---
source: src/modules/tickets/audit.ts
sha256: 7956ba58125986bbb412f2b25f05d4eaadad06b6ddb70f84401abc28fd834371
generated_at: 2026-10-29T06:00:40.038023+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/audit.ts

## Purpose

Declares the audit-action vocabulary owned by the tickets module and registers it into the app-wide `AuditActionMap` via TypeScript module augmentation. It exists so that every ticket-related audit event (both admin-driven and system-driven) has a typed, single-source identifier, enabling compile-time safety and cross-cutting audit validation.

## Key elements

- **`ticketsAuditActions`** (exported const) — Object of 10 string-literal action keys split into two families:
  - *Admin actions* (`admin.ticket.*`): `viewed`, `resolved`, `marked_spam`, `reopened`, `assigned`, `unassigned`, `noted`, `deleted`.
  - *System actions* (`system.ticket.*`): `opened`, `cleared`.
- **Module augmentation** (`declare module '@infrastructure/observability/audit'`) — Adds a `tickets` key to `AuditActionMap`, mapping it to the union of all values in `ticketsAuditActions`. This makes the actions available to the shared audit infrastructure without a circular import.

## Relationships

- **`src/modules/tickets/service.ts`**, **`services/workflow.ts`**, **`services/system.ts`** — Import `ticketsAuditActions` to label audit events they emit (e.g. resolve, assign, open, clear). They do not modify the vocabulary; they only reference its keys.
- **`src/modules/tickets/controllers/get-ticket-by-id.ts`** — Emits `ADMIN_TICKET_VIEWED` when a ticket is read, relying on this file for the action string.
- **`src/modules/tickets/tests/integration/service.test.ts`**, **`tests/integration/workflow.test.ts`** — Assert that the correct `ticketsAuditActions` keys appear in audit logs produced during integration scenarios.
- **`tests/cross-cutting/audit-actions-registered.test.ts`** — Verifies that every key in `ticketsAuditActions` is present in the global `AuditActionMap` after the augmentation is applied.

## Notes

- Reads are intentionally audited (`ADMIN_TICKET_VIEWED`). The module doc-comment explains this is a data-protection requirement: ticket rows contain a stranger's email and free text, unlike the public product catalogue where reads carry no such risk.
- The augmentation pattern (rather than a plain `import`/`export` cycle) mirrors the convention established in `modules/account/audit.ts` and is the project-wide way to contribute module-specific actions to the shared audit union.
- The `as const` on `ticketsAuditActions` is load-bearing: it preserves literal types so the augmentation yields a finite union, not `string`.
