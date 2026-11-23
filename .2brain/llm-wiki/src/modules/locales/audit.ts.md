---
source: src/modules/locales/audit.ts
generated_at: 2026-11-22T05:41:33.288258+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/audit.ts

## Purpose
Declares the audit actions the locales module emits and registers them with the app-wide audit action type. Each action corresponds to a write that changes what users read. These rows are the only history, because reads are deliberately not audited.

## Key elements
- `localeAuditActions`: a `const` object mapping constant names to action strings.
  - Locale lifecycle: `ADMIN_LOCALE_CREATED`, `ADMIN_LOCALE_UPDATED`, `ADMIN_LOCALE_ACTIVATED`, `ADMIN_LOCALE_DEACTIVATED` and `ADMIN_LOCALE_DELETED`. The strings are `admin.locale.*`.
  - Locale entries: `ADMIN_LOCALE_ENTRY_CREATED`, `ADMIN_LOCALE_ENTRY_UPDATED` and `ADMIN_LOCALE_ENTRY_DELETED`. The strings are `admin.locale_entry.*`.
  - `ADMIN_LOCALE_ENTRY_IMPORTED` (`admin.locale_entry.imported`): one action shared by both bulk routes, with the mode recorded in metadata. This gives compliance queries a single prefix to filter on.
  - `ADMIN_TRANSLATION_UPDATED` (`admin.translation.updated`): one action per PATCH request, covering its upserts and deletes together.
- `declare module '@infrastructure/observability/audit'`: augments `AuditActionMap` with a `locales` key. Its type is the union of the values of `localeAuditActions`.

## Relationships
This file imports nothing, and the neighbor files are not imported here.
- `src/modules/locales/services/entries.ts`, `src/modules/locales/services/languages.ts` and `src/modules/locales/services/translations.ts` are the likely emitters, matching the locale-entry, locale and translation action groups. This is inferred from the names, not visible in this file.
- `src/modules/locales/tests/integration/update-audit.test.ts` is the integration test for the audit rows.

## Notes
- The header comment refers to `modules/account/audit.ts` for why actions are declared by augmentation rather than a shared enum.
- Action strings must follow `noun.noun.verb`, with snake_case segments (for example `locale_entry`). The header says `tests/cross-cutting/audit-actions.test.ts` enforces this.
- Bulk import and translation PATCH are intentionally collapsed into single actions rather than one per mode or per locale touched.
- `as const` keeps the literal string types, which the `AuditActionMap` union relies on.
