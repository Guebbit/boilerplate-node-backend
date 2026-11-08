---
source: src/modules/locales/audit.ts
sha256: 393ab303c9817d33988b532d0ef1bb36baa3b801f31f9c68f9c72f0590816b34
generated_at: 2026-11-08T06:20:08.506357+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/audit.ts

## Purpose

Declares the audit-action identifiers for all write operations in the locales domain (locale CRUD, locale-entry CRUD/import, batch translation updates) and merges them into the app-wide `AuditActionMap` via TypeScript module augmentation. This file exists so that compliance queries can filter on a single, well-known prefix per event rather than per code path.

## Key elements

- **`localeAuditActions`** — a `const` object mapping descriptive constant names (e.g. `ADMIN_LOCALE_CREATED`) to dotted action strings (e.g. `'admin.locale.created'`). Covers nine locale/locale-entry actions plus `ADMIN_TRANSLATION_UPDATED`.
- **Module augmentation** (`declare module '@infrastructure/observability/audit'`) — adds a `locales` key to the global `AuditActionMap` interface, typed as the union of all values in `localeAuditActions`. This makes the strings type-safe at every call site that references `AuditActionMap['locales']`.

## Relationships

- **`src/modules/locales/services/languages.ts`** — emits the `ADMIN_LOCALE_*` actions (created/updated/activated/deactivated/deleted) defined here.
- **`src/modules/locales/services/entries.ts`** — emits the `ADMIN_LOCALE_ENTRY_*` actions (created/updated/deleted/imported) defined here.
- **`src/modules/locales/services/translations.ts`** — emits `ADMIN_TRANSLATION_UPDATED` (the batch PATCH action) defined here.
- **`src/modules/locales/tests/integration/update-audit.test.ts`** — integration test that asserts the audit rows written by the update flows match the action strings declared in this file.

## Notes

- **Naming contract:** action strings must be `noun.noun.verb` in snake_case segments. This is enforced by `tests/cross-cutting/audit-actions.test.ts`; a new action that deviates will fail CI.
- **No shared enum:** the file deliberately uses an object + augmentation rather than a shared enum, following the pattern set by `modules/account/audit.ts`. Do not "refactor" to an enum without updating the cross-cutting test.
- **`ADMIN_LOCALE_ENTRY_IMPORTED`** covers both bulk-import routes; the distinguishing mode is carried in the audit *metadata*, not the action string. Adding a separate action would fragment the "who changed the Spanish copy" query.
- **`ADMIN_TRANSLATION_UPDATED`** represents an entire batch (upserts + deletes) as a single row. One request = one audit row, regardless of how many locales the body touched.
- Reads are intentionally **not** audited; the rows here are the complete write history for this domain.
