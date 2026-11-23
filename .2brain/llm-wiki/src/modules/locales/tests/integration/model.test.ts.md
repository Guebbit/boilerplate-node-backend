---
source: src/modules/locales/tests/integration/model.test.ts
source_sha256: 979f742e2864bf67b5a26d35f0f9f3d786473079be7f6bc67bbc6bd2f564e572
context_sha256: 865c3f201f67759c17a892f1515fd358fc989eb5a8d31adbec0e811b43f8e4ba
generated_at: 2026-11-22T05:50:20.948928+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/tests/integration/model.test.ts

## Purpose
Integration tests for the two locale Mongoose models (language and locale entry). They check that neither collection leaks `_id`/`__v` on either response path (hydrated `toJSON` and the `.lean()` search path), and that schema defaults, tag normalization, and the derived `baseLanguage` field behave as the schema defines them rather than as a fixture claims.

## Key elements
- `setupTestDb()` — called at module level to provide the test database.
- `describe('language serialization')`:
  - `toJSON` exposes `id` and contains no `_id` or `__v`.
  - Omitted fields default to `direction = LocaleDirection.ltr`, `active = true`, `revision = 0`.
  - Tags are stored canonical (`'  PT-BR '` becomes `'pt-BR'`), so one language cannot become two rows.
- `describe('entry serialization')`:
  - A lean list from `localeService.searchEntries('es')` has a 24-hex `id` and no `_id` or `__v`.
  - An entry created without `value` stores `''`, since `required: true` on a String would refuse an empty translation.
- `describe('baseLanguage')`:
  - A table-driven `it.each` checks derivation from the tag: `es`→`es`, `pt-BR`→`pt`, `zh-Hant`→`zh`, `zh-Hant-HK`→`zh`.
  - A caller-supplied `baseLanguage: 'es'` on a `pt-BR` tag is overwritten to `pt`.

## Relationships
- `src/modules/locales/repository.ts` — `localeRepository` and `localeEntryRepository` create the documents under test.
- `src/modules/locales/services/index.ts` — `localeService` is used for the entry search that exercises the lean/transform path.
- `src/modules/locales/factories.ts` — `makeLocale` builds the language payloads for the `baseLanguage` table.
- `src/types/index.ts` — supplies the `LocaleDirection` enum.
- `tests/support/setup-test-db.ts` — `setupTestDb` sets up the database.
- `tests/support/stub.ts` — `asStub` casts the search result item to a record.

## Notes
- The tests assert behavior in the schema itself, not in the service. The `baseLanguage` hook is meant to cover every write path (seeds, scripts), and the hook overwrites caller-supplied values.
- The header comment gives the motivation: 95 schemas in `openapi.yaml` are `additionalProperties: false`, and the lean path bypasses `toJSON`, so serialization is asserted per model.
