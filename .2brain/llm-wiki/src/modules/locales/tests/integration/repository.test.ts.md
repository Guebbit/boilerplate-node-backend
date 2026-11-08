---
source: src/modules/locales/tests/integration/repository.test.ts
sha256: ff50b93a5b75b1f771c82a39592b57ef632251b7e63238657505062be1080b1c
generated_at: 2026-11-08T06:28:25.475314+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/integration/repository.test.ts

## Purpose

Integration tests for the locale write paths that run against a real MongoDB instance. They verify behaviors an in-memory fake cannot catch: revision-counter semantics across all five write paths, cascade spans across two collections, import effects on rows the caller did not supply, and transactional rollback of a mid-batch failure.

## Key elements

- **`givenLanguage(tag, entries?, overrides?)`** — Creates a locale via `localeRepository.create` and optionally seeds `localeEntryRepository` rows. Accepts an `active` flag for inactive-language scenarios.
- **`givenEntry(locale, app, key, value)`** — Writes a single entry directly through the repository (bypassing the service layer) so the test controls the exact `app` field.
- **`revisionOf(tag)`** — Reads the current `revision` field from the locale document; returns `-1` if the language is absent.
- **`describe('the revision counter')`** — Asserts that each write path (add, edit, remove, import) bumps revision by exactly 1, that idempotent writes and reads do *not* bump it, and that one language's write leaves other languages' revisions untouched.
- **`describe('importEntries')`** — Covers `counts` reporting, `replace: true` vs `replace: false` semantics, empty-body replace (empties the language), cross-language isolation, and a mocked `deleteMany` failure to prove the upsert + removal run in one transaction (rollback leaves pre-import state intact).
- **`describe('deleting a language')** — Exercises `localeService.removeLanguage`: cascade deletion of entries *and* translation rows, correct `removedEntries`/`removedTranslations` counts, 404 for unregistered tags, and isolation of other languages' data.

## Relationships

- **`@modules/locales/repository`** — Primary subject under test; exercises `localeRepository`, `localeEntryRepository`, and `translationRepository` directly.
- **`@modules/locales/factories`** — Provides `makeLocale` and `makeLocaleEntry` used by the setup helpers.
- **`@modules/locales/model`** — Imports `localeEntryModel` (spied on to simulate a `deleteMany` failure) and the `LocaleDocument` type.
- **`@modules/locales/services`** — Calls `localeService.readMessages`, `localeService.searchEntries`, and `localeService.removeLanguage` to test service-mediated reads and deletion.
- **`@modules/locales/tests/unit/apps.fixture`** — Imports the `FRONTEND` (and `BACKEND`) app-identifier constants.
- **`@tests/setup-test-db`** — Calls `setupTestDb()` at module top level to provision the real Mongo connection.

## Notes

- **Requires a live Mongo.** The file's doc comment explicitly states these are "unit tests in this repo's sense" only because there is no HTTP/auth layer, but they need a real database. CI must have Mongo available.
- **`FALLBACK = 'en'` is declared** but the test bodies use `'es'`, `'it'`, and `'zz'`; the constant documents the expected deployment fallback rather than being consumed by any assertion.
- **Transactional test (D17e-2)** mocks `localeEntryModel.deleteMany` to throw after the upsert step; it asserts the upserted rows are rolled back. This is the only test in the file that uses `jest.spyOn`.
- **`givenEntry` writes past the service** intentionally — the comment notes this so the `app` field is exactly what the test specifies, avoiding any service-layer transformation.
- The file is placed under `tests/integration/` despite the "unit tests" comment; the directory convention, not the comment, governs how it is discovered and run.
