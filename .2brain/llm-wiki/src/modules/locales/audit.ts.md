---
source: src/modules/locales/audit.ts
sha256: 393ab303c9817d33988b532d0ef1bb36baa3b801f31f9c68f9c72f0590816b34
generated_at: 2026-10-29T04:19:09.795986+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/audit.ts

## Purpose

Declares the set of audit action identifiers the locales module emits when an admin writes data (create/update/delete locales, entries, imports, and batch translation updates). It registers those identifiers into the app-wide `AuditActionMap` via TypeScript module augmentation so the audit infrastructure knows the locales module's vocabulary. Reads are intentionally not audited; these strings are the only history of what changed.

## Key elements

- **`localeAuditActions`** (const object, exported) — Maps descriptive constant names (`ADMIN_LOCALE_CREATED`, `ADMIN_LOCALE_ENTRY_IMPORTED`, `ADMIN_TRANSLATION_UPDATED`, etc.) to snake_case action strings (`admin.locale.created`, `admin.locale_entry.imported`, `admin.translation.updated`). Call sites use the key; the audit store records the value.
- **Module augmentation of `@infrastructure/observability/audit`** — Adds a `locales` field to the `AuditActionMap` interface, unioning the values of `localeAuditActions` into the global set of known audit actions. No runtime code; type-level only.

## Relationships

- **`services/languages.ts`**, **`services/entries.ts`**, **`services/translations.ts`** — These service files import `localeAuditActions` and pass the relevant constant when they emit an audit event after a successful write.
- **`tests/cross-cutting/audit-actions-registered.test.ts`** — Enforces the `noun.noun.verb` snake_case naming convention on every value in this file and verifies the module augmentation is present.
- **`src/modules/locales/tests/integration/update-audit.test.ts`** — Integration test that exercises the locales services and asserts the correct audit action strings are recorded.

## Notes

- **Naming convention is enforced by test.** Every value must match `noun.noun.verb` in snake_case. The cross-cutting test will fail on deviation.
- **One action per logical event, not per row.** `ADMIN_LOCALE_ENTRY_IMPORTED` covers both bulk upsert and bulk delete routes (the mode goes in metadata); `ADMIN_TRANSLATION_UPDATED` covers an entire PATCH batch regardless of how many locales it touches. This is deliberate so compliance queries can filter on a single prefix.
- **Augmentation, not a shared enum.** The file's doc comment points to `modules/account/audit.ts` for the rationale: each module augments `AuditActionMap` independently rather than importing from a central enum.
