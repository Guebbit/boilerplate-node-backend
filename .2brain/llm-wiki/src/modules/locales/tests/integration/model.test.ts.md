---
source: src/modules/locales/tests/integration/model.test.ts
sha256: e0949a00ee6afdbdee0b49022712a4b753d337e54837361ee59849d1e9fb547c
generated_at: 2026-09-27T15:02:50.089325+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/integration/model.test.ts

## Purpose

Integration tests that pin the serialization contract of the locale and locale-entry Mongoose models against a real database. They verify that neither `_id` nor `__v` leaks on either response path (hydrated `toJSON` or `.lean()` list), that schema defaults are populated on write, and that the `baseLanguage` derivation hook behaves correctly regardless of caller input. These assertions exist because 95 schemas in `openapi.yaml` are `additionalProperties: false`, so a leaked internal field would break every client.

## Key elements

- **`describe('language serialization')`** — Three tests on `localeRepository.create`: confirms `toJSON` maps `_id → id` and strips `__v`; asserts schema defaults (`direction: ltr`, `active: true`, `revision: 0`); verifies tag is trimmed and lowercased on write.
- **`describe('entry serialization')`** — Confirms the lean/search path (`localeService.searchEntries`) returns `id` (24-hex) with no `_id`/`__v`; asserts the `value` field defaults to `''` so an untranslated row is still a valid wire contract.
- **`describe('baseLanguage')`** — Parameterised test covering bare, regional, script, and compound tags (e.g. `zh-Hant-HK → zh`); a separate test confirms the schema hook overwrites a caller-supplied `baseLanguage` that contradicts the tag.

## Relationships

- **`src/modules/locales/repository.ts`** — Provides `localeRepository` and `localeEntryRepository`; all "create" tests write through these.
- **`src/modules/locales/services/index.ts`** — Provides `localeService.searchEntries`; the lean-path test exercises the real service → repository → schema pipeline.
- **`src/modules/locales/factories.ts`** — `makeLocale` is used in the `baseLanguage` parameterised test to build a minimal valid create payload.
- **`src/types/index.ts`** — Exports the `LocaleDirection` enum used to assert the default `direction` value.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module scope to provision a throwaway MongoDB before any test runs.
- **`tests/support/stub.ts`** — `asStub<…>` provides a type-safe cast on the service result so the test can index into `result.data?.items[0]` without narrowing boilerplate.

## Notes

- The file intentionally tests the **schema** (Mongoose hooks/defaults) rather than the service layer for `baseLanguage`, because any future write path (seed scripts, one-off migrations) that bypasses the service still hits the hook. The test comment makes this rationale explicit.
- `setupTestDb()` is called once at the top level; there is no per-test teardown visible in this file (it is presumably handled by the setup module).
- The tag-normalisation test uses `'  PT-BR '` (leading/trailing spaces + uppercase) to cover both trim and lowercase in a single assertion; don't expect separate tests for each.
