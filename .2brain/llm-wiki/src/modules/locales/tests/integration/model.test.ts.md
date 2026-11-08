---
source: src/modules/locales/tests/integration/model.test.ts
sha256: ba07f8b1e3da325135ec6a06813f161bbba19ba73b556ab48136dba7871dee74
generated_at: 2026-11-08T06:28:11.466069+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/integration/model.test.ts

## Purpose

Integration tests that pin the serialization contract of the `locale` and `localeEntry` Mongoose models: both the `toJSON` (hydrated) and `.lean()` (list) paths must expose `id` and never leak `_id`/`__v`. Also asserts schema-level defaults (`direction`, `active`, `revision`, empty `value`), tag normalization, and the `baseLanguage` derivation hook.

## Key elements

- **`describe('language serialization')`** — three tests: `toJSON` hides `_id`/`__v` and exposes `id`; omitted fields get schema defaults (`ltr`, `true`, `0`); tag is trimmed and lowercased on write (`'  PT-BR '` → `'pt-br'`).
- **`describe('entry serialization')`** — two tests: the `localeService.searchEntries` lean path returns items with a 24-hex `id` and no `_id`/`__v`; `value` defaults to `''` so an untranslated row is valid on the wire.
- **`describe('baseLanguage')`** — table-driven test (`it.each`) covering bare codes, regional variants, script subtags, and combined tags; a final test confirms the hook overrides any caller-supplied `baseLanguage`.

## Relationships

- **`src/modules/locales/repository.ts`** — `localeRepository.create` and `localeEntryRepository.create` are the write paths exercised by every test.
- **`src/modules/locales/services/index.ts`** — `localeService.searchEntries` is the lean/read path under test in the entry serialization block.
- **`src/modules/locales/factories.ts`** — `makeLocale` builds a full locale document so the `baseLanguage` tests only need to vary the `tag`.
- **`src/types/index.ts`** — `LocaleDirection.ltr` is the enum value asserted as the schema default.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called once at module top to provision an in-memory/ephemeral DB.
- **`tests/support/stub.ts`** — `asStub` narrows untyped array elements so assertions can access arbitrary properties without a domain type.

## Notes

- Both serialization paths are tested explicitly because the `.lean()` path bypasses `toJSON` entirely, and `openapi.yaml` marks 95 schemas `additionalProperties: false` — a leaked field would break consumers silently.
- `baseLanguage` is derived by a **Mongoose schema hook**, not by service code. The "overrides whatever a caller supplied" test exists to prove the hook (not the caller) is the source of truth, since new write paths (seeds, scripts) must still get it for free.
- `value` defaulting to `''` is intentional: the OpenAPI contract marks the field `required`, but an imported key may legitimately have no translation yet.
