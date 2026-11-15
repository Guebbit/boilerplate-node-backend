---
source: src/modules/locales/tests/integration/repository.test.ts
sha256: b93baa4cf97f9b9d7a64a4bff7163a679cd10c6b649523028840d5561c91b8d3
generated_at: 2026-11-14T20:24:14.834410+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/integration/repository.test.ts

## Purpose

Integration tests for the locales repository **write paths** against a real MongoDB instance. The file exists because the properties under test—transactional atomicity between a row write and its revision bump, cascade deletion across collections, and an import's side-effect on rows it was not given—cannot be meaningfully faked in memory. Despite the "integration" label, the repo's convention treats these as unit tests: no HTTP, no auth, no network beyond the local Mongo.

## Key elements

- **`givenLanguage(tag, entries?, overrides?)`** — Creates a locale via `localeRepository.create` and seeds any number of frontend-app entries. The standard setup for every test case.
- **`givenEntry(locale, app, key, value)`** — One-row insert through the repository (bypassing the service layer so the app is exactly what the test specifies).
- **`valuesOf(tag)`** — Reads all frontend entries for a tag and returns them as a `Map<key, value>` for assertion.
- **`revisionOf(tag)`** — Reads the current `revision` counter from the locale document (returns `-1` if the locale is absent).
- **`failNextBump()`** — Spies on `localeModel.findOneAndUpdate` to throw on the next call, simulating a database error mid-transaction.
- **`describe('an entry write and its bump are one transaction')`** — Three tests verifying that a failed revision bump rolls back the row create, value save, or entry removal.
- **`describe('the revision counter')`** — Eight tests asserting the counter moves exactly once per write (add, edit, remove, import) and does **not** move on idempotent edits, no-op imports, reads, or writes to other languages.
- **`describe('importEntries')`** — Six tests covering created/updated/removed counts, `replace` vs. merge semantics, empty-body replace (full wipe), cross-language isolation, and transactional rollback when the deletion step fails mid-import.
- **`describe('deleting a language')`** — Verifies `localeService.removeLanguage` cascades to entries and translations, returns accurate counts, and (in the truncated remainder) likely covers edge cases like deleting an inactive or nonexistent language.

## Relationships

- **`src/modules/locales/repository.ts`** — The system under test. `localeRepository`, `localeEntryRepository`, and `translationRepository` are the only repositories exercised.
- **`src/modules/locales/model.ts`** — `localeModel` and `localeEntryModel` are spied on (`findOneAndUpdate`, `deleteMany`) to inject controlled failures and assert transaction rollback.
- **`src/modules/locales/factories.ts`** — `makeLocale` and `makeLocaleEntry` produce deterministic fixture objects passed to repository creates.
- **`src/modules/locales/services/index.ts`** — `localeService` is used for `removeLanguage`, `readMessages`, and `searchEntries` (to confirm reads don't mutate the counter and that deletion cascades correctly).
- **`src/modules/locales/tests/unit/apps.fixture.ts`** — Supplies the `FRONTEND` (and `BACKEND`) app constants shared with the unit-test suite so both layers agree on the discriminator value.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module top-level to provision and reset a real Mongo instance before the suite runs.

## Notes

- The file is truncated in the source shown here; the "deleting a language" block likely contains additional cases (inactive language, already-deleted language, translation cascade) beyond the single visible test.
- `FALLBACK = 'en'` is defined with a comment referencing `.env-example` but is not referenced by any visible test—likely used in the truncated remainder or as documentation of the environment contract.
- Tests use `Array.prototype.toSorted()` (ES2023), implying the project targets Node ≥ 20 / a modern TS lib.
- The `translationRepository` import is present in the visible content but not yet exercised by any test shown; it is presumably used in the truncated deletion tests to assert translation rows are removed alongside entries.
- Conventions: each write path's revision bump is asserted in isolation (not via a shared helper) so a regression in one path fails loudly without masking the others. Failure-injection is always done via `jest.spyOn` + `mockImplementationOnce`, cleaned up in `afterEach` with `restoreAllMocks()`.
