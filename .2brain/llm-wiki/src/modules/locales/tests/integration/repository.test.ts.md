---
source: src/modules/locales/tests/integration/repository.test.ts
sha256: 36fa85a19f4108fee091775b9d7181acdb19dc3c3f61226907e4994dfd0aa207
generated_at: 2026-09-27T15:03:06.469733+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/integration/repository.test.ts

## Purpose

Integration tests for the locales module's write paths, executed against a real MongoDB instance. They verify behaviors that an in-memory fake would satisfy by construction: the revision counter advancing per write, cascading deletes across two collections, and `importEntries` side-effects on rows not included in the payload. No HTTP or auth is involved.

## Key elements

- **`givenLanguage(tag, entries?, overrides?)`** – helper that creates a locale record (via `localeRepository.create` + `makeLocale`) and optionally seeds frontend-tenant entries under that tag.
- **`givenEntry(locale, tenant, key, value)`** – creates a single entry in an explicitly named tenant, bypassing the service layer.
- **`revisionOf(tag)`** – reads the current `revision` field for a locale tag; returns `-1` if the locale is missing.
- **`describe('the revision counter')`** – asserts the counter moves exactly once per write path (add, edit, remove, import-batch), does not move on reads, and does not leak to other languages.
- **`describe('importEntries')`** – covers upsert count reporting, `replace: true` vs `replace: false` semantics (asserted as a pair), empty-body replace emptying a language, cross-language isolation, and transactional rollback when the removal step throws.
- **`describe('deleting a language')`** – covers 409 for active locales, cascade of entries *and* translations, cross-language safety, 404 for unknown tags, and refusal to delete the fallback locale even when inactive.
- **`describe('deactivating a language')`** – (truncated in source) exercises the deactivation path.
- **`FALLBACK`** – constant `'en'`, matching `.env-example`; used in the fallback-protection test.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/locales/repository.ts` | Primary SUT: `localeRepository`, `localeEntryRepository`, `translationRepository` are the objects under test. |
| `src/modules/locales/factories.ts` | `makeLocale` / `makeLocaleEntry` build fixture documents for repository calls. |
| `src/modules/locales/model.ts` | `localeEntryModel` is spied on in the rollback test (`deleteMany` mocked to throw); `LocaleDocument` type is imported for typing. |
| `src/modules/locales/services/index.ts` | `localeService` is exercised for read paths (`readMessages`, `searchEntries`), `deleteLanguage`, and the deactivation suite. |
| `src/modules/locales/tests/unit/tenants.fixture.ts` | `BACKEND` / `FRONTEND` constants label tenant-scoped entries throughout. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` boots and tears down the real MongoDB instance for the whole file. |

## Notes

- **Real Mongo required.** The file's docblock explains that every property under test (revision monotonicity, two-collection cascade, import side-effects) would pass trivially against an in-memory fake, so a live database is non-negotiable.
- **Rollback test is transactional.** The `D17e-2` test mocks `localeEntryModel.deleteMany` to throw mid-transaction and asserts the upserted keys are rolled back. This is the only test that patches the model layer.
- **`replace` vs `merge` are asserted together.** The comment notes that either assertion alone would pass against an implementation that ignores the flag; the pair is intentional.
- **Fallback protection.** Deleting the `en` locale returns 409 even when `active: false`—the test documents this as a deliberate guard rather than a state-machine edge case.
- **Tenant is always `FRONTEND`** in this file. `BACKEND` is imported but only appears in the fixture helper's signature, not in any assertion.
