---
source: src/modules/locales/tests/integration/repository.test.ts
sha256: 776a116cb7a5e626ed9cba407a09ce644d31cca8a32db18e924955baf272f227
generated_at: 2026-09-23T18:53:44.285886+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/integration/repository.test.ts

## Purpose

Integration tests for the locales module's write paths, executed against a real MongoDB instance. Despite requiring a database, they are classified as unit tests in this repo because they skip HTTP and auth. The suite targets properties an in-memory fake would satisfy by construction: revision-counter movement, cross-collection cascades, and import side-effects on rows the caller did not supply.

## Key elements

- **`givenLanguage(tag, entries?, overrides?)`** — helper that creates a locale and optionally seeds its entry rows; used by every test case.
- **`givenEntry(locale, tenant, key, value)`** — creates a single entry row, writing past the service so the tenant field is exactly as the test specifies.
- **`revisionOf(tag)`** — reads and returns the locale's stored revision (or `-1` if missing).
- **`describe('the revision counter')`** — six assertions: add, edit, remove, import (bumps once, not per row), read (does not bump), and isolation (other locales untouched).
- **`describe('importEntries')`** — verifies `counts` shape, `replace: true` vs `replace: false` semantics (paired assertions), empty-body replace, and cross-locale isolation.
- **`describe('deleting a language')`** — covers 409 on active, 409 on fallback, 404 on missing, cascade of entries and translations, and isolation of other locales.
- **`describe('deactivating a language')`** — ensures the fallback locale cannot be deactivated but remains updatable on other fields.
- **`describe('the translations collection')`** — concurrency-safety checks for `upsertEntityLocale` (content truncated in source).

## Relationships

- **`src/modules/locales/factories.ts`** — supplies `makeLocale` and `makeLocaleEntry` for all test-data creation.
- **`src/modules/locales/repository.ts`** — the primary system under test; exposes `localeRepository`, `localeEntryRepository`, and `translationRepository`.
- **`src/modules/locales/services/index.ts`** — supplies `localeService` for service-level write paths (delete, update, read, search).
- **`src/modules/locales/model.ts`** — provides the `LocaleDocument` type (imported as a type only).
- **`src/modules/locales/tests/unit/tenants.fixture.ts`** — provides the `BACKEND` and `FRONTEND` tenant constants used throughout.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb()` called at module level to connect to a real Mongo before any test runs.

## Notes

- The suite hard-codes `FALLBACK = 'en'`, documented as matching `.env-example`; changing that env value without updating this constant will silently alter which locale the fallback-guard tests protect.
- The `replace: true` / `replace: false` pair for `importEntries` is deliberately asserted as a pair: the file's own comment states that either assertion alone would pass against an implementation that ignores the flag.
- `givenEntry` intentionally bypasses `localeService` to pin the tenant field; using the service path here would let the service's own tenant logic mask a repository-level bug.
- The file header clarifies these are "unit tests in this repo's sense" — a non-standard use of the term, but the distinction (no HTTP, no auth) is the repo's own convention.
