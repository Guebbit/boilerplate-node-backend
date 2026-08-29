# src/modules/locales/audit.ts

## Purpose

Defines the audit action constants for all locale-management write operations (locale CRUD and locale-entry CRUD/import) and registers them in the shared audit type map via module augmentation. The file exists because the dictionary stores no edit history and copy has left the repository, so these rows are the sole record of who changed what translation text.

## Key elements

- **`localeAuditActions`** (const object) — Seven string constants in `noun.noun.verb` form: `admin.locale.{created,updated,deleted}`, `admin.locale_entry.{created,updated,deleted,imported}`. The single `imported` action covers both bulk routes; the differing mode is carried in metadata rather than split into two actions.
- **`declare module '@infrastructure/observability/audit'`** — Augments `AuditActionMap` with a `locales` key typed as the union of the values above, so the observability layer can reference these actions in a type-safe way.

## Relationships

- **`src/modules/locales/services/languages.ts`** — Emits the `ADMIN_LOCALE_*` actions (create, update, delete a locale) when mutating locale records.
- **`src/modules/locales/services/entries.ts`** — Emits the `ADMIN_LOCALE_ENTRY_*` actions (create, update, delete, import entries) when mutating individual translation entries or performing bulk imports.
- **`src/modules/locales/tests/unit/audit.test.ts`** — Unit-tests the constants exported by this file (shape, naming, completeness).

## Notes

- **Snake-case is mandatory, not hyphenated.** The cross-cutting sweep `tests/cross-cutting/audit-actions.test.ts` enforces `noun.noun.verb` in lower snake_case; `locale-entry` would fail it, `locale_entry` passes.
- **Reads are intentionally not audited** in either tier. `GET /locales/{locale}/messages` is public/anonymous, and `GET /locales/{locale}/entries` returns publish-ready text—unlike the `feedback` module, whose reads are audited because they carry PII.
- **Augmentation, not a shared enum.** The pattern mirrors `modules/account/audit.ts`; each domain declares its own action set and plugs it into the global `AuditActionMap` interface rather than importing from a central registry.
