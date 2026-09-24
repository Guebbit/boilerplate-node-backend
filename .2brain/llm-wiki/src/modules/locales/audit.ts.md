---
source: src/modules/locales/audit.ts
sha256: 587877784b86b43e11383c4e530fd78c91bffdf6ae2138ce08561d5c187493e3
generated_at: 2026-09-23T18:47:52.776407+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/audit.ts

## Purpose

Declares the set of audit-action identifiers that the locales module emits when an admin performs a write operation (create, update, delete, import). These strings are the sole historical record of locale/translation changes—reads are deliberately not audited. The file also augments the app-wide `AuditActionMap` so TypeScript recognizes these values as valid audit actions.

## Key elements

- **`localeAuditActions`** — `as const` object mapping readable key names (e.g. `ADMIN_LOCALE_CREATED`) to dotted string identifiers (e.g. `'admin.locale.created'`). Covers locale CRUD, locale-entry CRUD, bulk import (one action for both import modes), and batch translation update (one action for the entire PATCH).
- **Module augmentation** (`declare module '@infrastructure/observability/audit'`) — adds a `locales` key to `AuditActionMap`, typed as the union of all values in `localeAuditActions`. This is how the app-wide type system learns these actions exist without a shared enum.

## Relationships

- **`src/modules/locales/services/languages.ts`** — emits the `ADMIN_LOCALE_*` actions when creating, updating, or deleting a locale.
- **`src/modules/locales/services/entries.ts`** — emits the `ADMIN_LOCALE_ENTRY_*` actions for individual entry mutations and the `ADMIN_LOCALE_ENTRY_IMPORTED` action for bulk imports.
- **`src/modules/locales/services/translations.ts`** — emits `ADMIN_TRANSLATION_UPDATED` for batch PATCH requests that upsert and delete translations in one call.
- **`tests/cross-cutting/audit-actions-registered.test.ts`** — enforces the `noun.noun.verb` naming convention (snake_case segments) on every value in `localeAuditActions`.
- **`src/modules/locales/tests/unit/audit.test.ts`** — unit-tests the actions defined here.

## Notes

- Actions are declared by **module augmentation**, not a shared enum, following the same pattern as `modules/account/audit.ts`. This keeps each module's audit vocabulary local while still contributing to the global type.
- `ADMIN_LOCALE_ENTRY_IMPORTED` is intentionally a single action for both bulk-import modes; the mode distinction lives in audit metadata, not in the action string. This keeps compliance queries simple (one prefix to filter on).
- `ADMIN_TRANSLATION_UPDATED` represents the entire batch (upserts + deletes) as one row per request, not one row per affected locale.
- Naming must satisfy the cross-cutting test's `noun.noun.verb` rule—snake_case segments, no camelCase.
