---
source: src/modules/locales/tests/integration/repository.test.ts
sha256: d0b092e576cdf3d71ee7d378dd78a5bd367effaebb82af1d760dd798b3224f3c
generated_at: 2026-10-15T10:48:04.798852+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/integration/repository.test.ts

## Purpose

Integration tests for the locales repository write paths (create, edit, remove, import, delete) executed against a real MongoDB instance. They exist because the properties under test — the revision counter, cross-collection cascades, and import side-effects on rows not present in the request body — are trivially satisfied by any in-memory fake, so a real database is required to catch genuine regressions.

## Key elements

- **`givenLanguage(tag, entries?, overrides?)`** — creates a locale via `localeRepository.create` and seeds `FRONTEND` entries; the standard setup helper for every test case.
- **`givenEntry(locale, app, key, value)`** — single-entry creation bypassing the service layer so the app is exactly what the test specifies.
- **`revisionOf(tag)`** — reads and returns the stored revision counter for a locale tag (or `-1` if the locale is gone).
- **`describe('the revision counter')`** — asserts the counter increments on each of the five write paths (add, edit, remove, import, …) and does **not** increment on no-op edits, no-op imports, reads, or when a different language is unaffected.
- **`describe('importEntries')`** — covers count reporting (`created`/`updated`/`removed`), `replace: true` vs `replace: false` semantics (delete-vs-keep), empty-body replace clearing all keys, cross-language isolation, and transactional rollback when the deletion step fails mid-batch.
- **`describe('deleting a language')`** — covers the 409 refusal for active locales, cascade of entries and translation rows, 404 for unregistered tags, and cross-language isolation.

## Relationships

- **`src/modules/locales/repository.ts`** — the primary unit under test; all three repositories (`localeRepository`, `localeEntryRepository`, `translationRepository`) are exercised directly.
- **`src/modules/locales/services/index.ts`** — `localeService.readMessages`, `localeService.searchEntries`, and `localeService.deleteLanguage` are called to verify service-level orchestration (active-check, cascade, result shape).
- **`src/modules/locales/factories.ts`** — provides `makeLocale` and `makeLocaleEntry` for realistic test fixtures.
- **`src/modules/locales/model.ts`** — `localeEntryModel` is imported so the transaction-rollback test can spy on `deleteMany`; `LocaleDocument` type is referenced.
- **`src/modules/locales/tests/unit/apps.fixture.ts`** — supplies the `FRONTEND` app constant used throughout.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is invoked at module top-level to bring up and clean the shared Mongo instance before any test runs.

## Notes

- Despite living in an `integration/` directory, the file's own docblock labels these "unit tests in this repo's sense" (no HTTP, no auth). The distinguishing factor is the real database, not the level of the boundary.
- `setupTestDb()` runs at import time; a running MongoDB is a hard prerequisite for this suite to even load.
- The revision-counter suite intentionally asserts each write path in a separate `it` rather than a single "writing bumps it" test, so a regression in one path is pinpointed.
- The `replace: true` / `replace: false` pair is asserted as a pair in one test ("deletes what the body did not name, when replacing" vs. "leaves … when merging") to catch implementations that ignore the flag.
- The D17e-2 rollback test uses `jest.spyOn(localeEntryModel, 'deleteMany').mockImplementationOnce` to inject a failure between the upsert and the deletion, verifying the transaction rolls back the upserted keys.
- `FALLBACK = 'en'` is declared at module scope (documented as the deployment's fallback locale per `.env-example`) but is not referenced in the visible test bodies; it may be used in truncated sections.
