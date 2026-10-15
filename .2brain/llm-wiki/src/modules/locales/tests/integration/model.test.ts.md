---
source: src/modules/locales/tests/integration/model.test.ts
sha256: ba07f8b1e3da325135ec6a06813f161bbba19ba73b556ab48136dba7871dee74
generated_at: 2026-10-15T10:47:48.945730+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/integration/model.test.ts

## Purpose

Integration tests that pin down the Mongoose schema-level behavior for the locales module: serialization (no `_id`/`__v` leakage on either the `toJSON` or `.lean()` path), schema defaults, tag normalization, and the `baseLanguage` derivation hook. They exist because the lean path bypasses `toJSON` entirely and 95 OpenAPI schemas declare `additionalProperties: false`, so a regression in either path would silently break the wire contract.

## Key elements

- **`describe('language serialization')`** — three tests against `localeRepository.create`:
  - Asserts `toJSON` maps `_id` → `id` and strips `_id`/`__v` from the serialized output.
  - Asserts schema defaults are applied when the caller omits them (`direction = 'ltr'`, `active = true`, `revision = 0`).
  - Asserts tag is trimmed and lowercased on write (`"  PT-BR "` → `"pt-br"`).
- **`describe('entry serialization')`** — two tests:
  - Exercises `localeService.searchEntries('es')` to hit the `.lean()` path, then asserts the resulting item has an `id` (24-hex) and no `_id`/`__v`.
  - Confirms an omitted `value` defaults to `''` (an untranslated row is a legitimate state; the field is still `required: true` on the wire).
- **`describe('baseLanguage')`** — four parameterized cases (`es`, `pt-BR`, `zh-Hant`, `zh-Hant-HK`) plus one override test:
  - Uses `makeLocale` factory to verify the schema hook derives `baseLanguage` from the first subtag of `tag`.
  - Asserts a caller-supplied `baseLanguage` that contradicts the tag is overwritten by the hook (the field is absent from all request schemas).
- **Module-level `setupTestDb()`** — spins up a real MongoDB instance before the suite runs.

## Relationships

- **`tests/support/setup-test-db.ts`** — called once at module scope; provides a live MongoDB connection so tests exercise real Mongoose middleware/hooks.
- **`tests/support/stub.ts`** — `asStub<Record<string, unknown>>` is used to cast the search result so individual fields can be asserted without fighting the typed return.
- **`src/modules/locales/repository.ts`** — `localeRepository.create` and `localeEntryRepository.create` are the write paths under test; `localeService.searchEntries` is the read path.
- **`src/modules/locales/services/index.ts`** — `localeService.searchEntries` is the only service method called; it exercises the lean/transform path.
- **`src/modules/locales/factories.ts`** — `makeLocale` builds a valid locale document for the `baseLanguage` parameterized tests.
- **`src/types/index.ts`** — `LocaleDirection` enum is used to assert the default `direction` value.

## Notes

- These are **integration** tests (real DB), not unit tests. `setupTestDb()` must succeed or the whole file fails at import time.
- The lean-path test and the `toJSON` test are deliberately separate: a bug in `applySerialization` or the lean transform would be caught by one but not the other.
- The `baseLanguage` tests confirm the derivation lives in a **schema hook** (pre-save), not in the service. This means seeds, scripts, or any future write path get the derivation for free without importing extra logic.
- The empty-`value` test is a contract guard: the OpenAPI schema marks `value` as `required: true` (String), but the default `''` satisfies it while representing "not yet translated." Removing the default would make an untranslated import impossible.
