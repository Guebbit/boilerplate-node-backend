---
source: src/modules/locales/tests/unit/schema-contract.test.ts
sha256: 75d22d669f7d29e0e26c4ad0b6857e07a298f4d726338042ce423fc9924d4f5d
generated_at: 2026-11-08T06:29:32.282960+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/unit/schema-contract.test.ts

## Purpose

Unit tests that pin down the database-level contracts of the locale and localeEntry schemas — unique indexes, field normalisation, defaults, and required paths — plus the behaviour of `deriveBaseLanguage`. They exist so that a schema refactor cannot silently break the invariants the language negotiator and the translation merge (upsert) rely on.

## Key elements

- **`normalises(schema, path)`** — local helper that reads a field's Mongoose `options` (`lowercase`, `trim`) so tests can assert normalisation without re-implementing schema introspection.
- **`describe('localeSchema')`** — asserts required paths (`baseLanguage`, `name`, `nativeName`, `tag`), the `locales_tag` unique index, case/whitespace normalisation on `tag` and `baseLanguage`, defaults (`direction: ltr`, `active: true`, `revision: 0`), and that `direction` is restricted to `LocaleDirection` values.
- **`describe('deriveBaseLanguage')`** — asserts primary-subtag extraction (`en-GB` → `en`), pass-through for bare tags, and case/whitespace normalisation of the input.
- **`describe('localeEntrySchema')`** — asserts required paths (`app`, `key`, `locale`), the `localeEntries_locale_app_key` compound unique index, selective normalisation (locale/app lowercased, key trimmed but *not* lowercased), `value` defaulting to `''`, and `timestamps: true`.

## Relationships

- **`src/modules/locales/model.ts`** — the unit under test. Provides `localeSchema`, `localeEntrySchema`, and `deriveBaseLanguage`.
- **`src/types/index.ts`** — supplies the `LocaleDirection` enum used to validate the `direction` field's enum constraint and default.
- **`tests/support/schema.ts`** — provides the schema-introspection helpers (`requiredPaths`, `indexSpecs`, `indexOptionSpecs`, `defaultOf`, `enumOf`, `optionsOf`) that turn Mongoose schema metadata into plain-value assertions, keeping the test file free of Mongoose-internal traversal.

## Notes

- Tests assert schema *metadata* (options, indexes, defaults) in memory; no database connection or document creation occurs.
- The `key` field in `localeEntrySchema` is intentionally **not** lowercased (only trimmed), unlike `locale` and `app`. The test explicitly asserts `lowercase` is `undefined` for `key` — do not "fix" this to match the others.
- `value` is absent from `requiredPaths` by design; the test documents that an empty string (not `null`/`undefined`) is the sentinel for "declared but untranslated."
- `baseLanguage` is required but never supplied by callers — a `pre('validate')` hook (not tested here) populates it via `deriveBaseLanguage`. The test only checks the required-path contract.
