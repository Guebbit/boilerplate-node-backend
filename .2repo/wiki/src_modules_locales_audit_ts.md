# src/modules/locales/audit.ts

## Purpose

Declares the audit action strings that the locales module emits when an admin mutates locale or locale-entry records, and merges them into the app-wide `AuditActionMap` type via module augmentation. This gives call sites in the locale services a typed, centralized source of action identifiers while keeping the naming convention (`noun.noun.verb`) enforced cross-cuttingly.

## Key elements

- **`localeAuditActions`** (exported const) — Maps seven constant names (`ADMIN_LOCALE_CREATED`, `…UPDATED`, `…DELETED`, `ADMIN_LOCALE_ENTRY_CREATED`, `…UPDATED`, `…DELETED`, `ADMIN_LOCALE_ENTRY_IMPORTED`) to their string values (e.g. `'admin.locale_entry.imported'`).
- **Module augmentation of `@infrastructure/observability/audit`** — Extends `AuditActionMap` with a `locales` key typed as the value union of `localeAuditActions`, making the actions part of the global audit type system without a shared enum.

## Relationships

- **`src/modules/locales/services/languages.ts`** — Consumes `localeAuditActions` values (e.g. `ADMIN_LOCALE_CREATED/UPDATED/DELETED`) when recording admin locale CRUD events.
- **`src/modules/locales/services/entries.ts`** — Consumes the entry-scoped actions (`ADMIN_LOCALE_ENTRY_*`) when recording admin locale-entry CRUD and bulk-import events.
- **`src/modules/locales/tests/unit/audit.test.ts`** — Unit-tests the shape, values, or typing of `localeAuditActions` defined here.

## Notes

- The naming format (`noun.noun.verb`, snake_case) is not enforced by this file alone; `tests/cross-cutting/audit-actions.test.ts` validates it across all modules.
- Bulk import of locale entries uses a **single** action (`ADMIN_LOCALE_ENTRY_IMPORTED`) rather than separate upsert/overwrite actions; the differentiation lives in the event's metadata, keeping compliance queries to one filterable prefix.
- The augmentation pattern (vs. a shared enum) is deliberate and mirrors the approach in `modules/account/audit.ts`; do not refactor to a common enum without checking that file's rationale.
- Only write operations are audited here; reads are intentionally excluded.
