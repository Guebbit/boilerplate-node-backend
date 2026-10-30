---
source: src/modules/locales/tests/integration/repository.test.ts
sha256: ff50b93a5b75b1f771c82a39592b57ef632251b7e63238657505062be1080b1c
generated_at: 2026-10-29T04:26:12.281764+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/integration/repository.test.ts

## Purpose

Integration tests for the locales write paths, run against a real MongoDB instance. The file verifies properties an in-memory fake would satisfy trivially: the revision counter incrementing (or not) on each write, cross-collection cascades on language deletion, and the side-effects of `importEntries` on rows the caller did not supply. Despite living under `tests/integration/`, the file's own comment classifies these as unit tests in this repo's taxonomy — no HTTP, no auth, just repository/service calls.

## Key elements

- **`givenLanguage(tag, entries?, overrides?)`** — seeds a language via `localeRepository.create` and optional `FRONTEND`-scoped entries; returns the created locale document.
- **`givenEntry(locale, app, key, value)`** — one-off entry creation helper (defined but unused in the visible test bodies).
- **`revisionOf(tag)`** — reads back the current revision for assertions.
- **`describe('the revision counter')`** — 8 tests asserting each write path (add, edit, remove, import) bumps revision to exactly 1; idempotent writes (same-value edit, no-op import) leave it at 0; reads do not move it; a sibling language's revision is untouched.
- **`describe('importEntries')`** — 6 tests covering the `counts` return (`created`/`updated`/`removed`), `replace: true` vs `replace: false` semantics (tested as a deliberate pair), empty-body-with-replace clearing all keys, language isolation, and transactional rollback when `deleteMany` throws mid-batch.
- **`describe('deleting a language')`** — 5 tests covering cascade removal of entries *and* translation rows, count reporting, sibling-language isolation, and a 404 for an unregistered tag.

## Relationships

- **`@modules/locales/repository`** — the primary subject under test: `localeEntryRepository`, `localeRepository`, `translationRepository`.
- **`@modules/locales/services`** — `localeService` is exercised for `readMessages`, `searchEntries`, and `removeLanguage` (the cascade-delete path).
- **`@modules/locales/factories`** — `makeLocale` and `makeLocaleEntry` supply the document shapes for seeding.
- **`@modules/locales/model`** — `localeEntryModel` is spied on (`jest.spyOn`) in the rollback test; `LocaleDocument` type is imported.
- **`tests/support/setup-test-db`** — `setupTestDb()` connects the suite to a real Mongo before any test runs.
- **`tests/unit/apps.fixture`** — provides the `BACKEND` / `FRONTEND` app-name constants used in every entry assertion.

## Notes

- Requires a reachable MongoDB instance; `setupTestDb()` is called at module top level, not inside `beforeAll`.
- The `FALLBACK` constant (`'en'`) is declared but not referenced in any visible test body — likely reserved for a future assertion or a leftover.
- The rollback test (`D17e-2`) mocks `localeEntryModel.deleteMany` to throw, verifying that the upserted rows are rolled back. This is the only test in the file that touches the Mongoose model directly rather than going through the repository.
- `replace: true` vs `replace: false` for `importEntries` are tested as a deliberate pair; the comment notes that asserting only one direction would still pass against an implementation that ignores the flag.
- `givenEntry` is defined but never called in the visible test bodies — tests that need a single entry use `localeEntryRepository.createEntry` inline.
