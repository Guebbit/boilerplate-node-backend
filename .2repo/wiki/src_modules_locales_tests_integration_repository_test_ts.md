# src/modules/locales/tests/integration/repository.test.ts

## Purpose

Integration tests for the locales module that exercise every write path against a real MongoDB instance. They exist because the properties under test—atomic revision-counter increments, cross-collection cascade deletes, and import side-effects on rows *not* included in the request body—would all pass trivially against an in-memory fake and therefore need a real database to be meaningful.

## Key elements

- **`givenLanguage(tag, entries?, overrides?)`** — Creates a locale document via `localeRepository.create` and optionally seeds `localeMessageRepository` rows. The shared setup for every case.
- **`givenEntry(locale, tenant, key, value)`** — Writes a single message row directly through the repository.
- **`revisionOf(tag)`** — Reads and returns the stored revision number (or −1 if the language is gone).
- **`describe('the revision counter')`** — Six cases asserting that each of the five write paths (add, edit, remove, import, …) increments the revision by exactly 1, that reads do *not* increment it, and that sibling languages are untouched.
- **`describe('importEntries')`** — Covers created/updated/removed counts, `replace: true` vs `replace: false` semantics (asserted as a deliberate pair), empty-body replace emptying the language, and language isolation.
- **`describe('deleting a language')`** — Active-language refusal (409, no data destroyed), successful cascade (entries removed, document deleted), isolation from other languages, and 404 for unknown tags.
- **`describe('readMessages')`** — Validates the nested tree shape and revision in the response body; confirms inactive languages return 404 indistinguishable from unknown ones.
- **`describe('createEntry')`** — Collision (409), prefix-ancestor collision (409), unsafe/prototype key (422, intentionally a different status), and prefix-sharing-without-ancestor (accepted).
- **`describe('importEntries, through the service')`** — Batch self-collision rejection before any write occurs.

## Relationships

- **`src/modules/locales/repository.ts`** — Primary subject under test; `localeRepository` and `localeMessageRepository` are called directly for most assertions.
- **`src/modules/locales/services/index.ts`** — `localeService` is the subject for higher-level paths (deleteLanguage, readMessages, createEntry, importEntries) where business rules and status codes live.
- **`src/modules/locales/factory.ts`** — Supplies `makeLocale` and `makeLocaleEntry` for constructing valid document fixtures.
- **`src/modules/locales/model.ts`** — Provides the `LocaleDocument` type (imported as a type-only import for typing the `givenLanguage` return).
- **`src/modules/locales/tests/unit/tenants.fixture.ts`** — Provides the `BACKEND` and `FRONTEND` tenant string constants used throughout.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called once at module scope to establish the real Mongo connection before any test runs.

## Notes

- The file's header comment explicitly states *why* a real DB is required: an in-memory fake would satisfy the revision-atomicity, cascade, and import-side-effect properties by construction, making the assertions vacuous.
- The revision counter is asserted per write path (five separate cases) rather than as a single "writing bumps it" test, so a regression in any one path is caught individually.
- The replace/merge pair in `importEntries` is asserted as a deliberate pair: the author notes that either assertion alone would pass against an implementation that simply ignores the flag.
- Inactive languages return **404**, not 403 or empty-200, to avoid leaking existence to anonymous callers—a security property pinned by the `readMessages` test.
- `createEntry` distinguishes 409 (collision with existing rows) from 422 (structurally unsafe key like `__proto__.title`); the comment explains this is intentional because the remediation differs.
- The empty-body `replace: true` case is annotated as an admin-only destructive operation (guarded by auth and audit at the route level, not in this test).
