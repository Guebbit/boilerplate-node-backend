---
source: src/modules/example/tests/integration/translations.test.ts
sha256: bcc9a71b050f9efd001e5195745b9c1348a358cdcc38a86c84636b92bb3eb176
generated_at: 2026-10-14T15:48:00.036850+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/tests/integration/translations.test.ts

## Purpose

Integration test that exercises the `locales` translation endpoint end-to-end for the `example` module. It verifies the full contract: fallback-language writes are copied onto the row, non-fallback writes only create a translation slot, undeclared fields are rejected (422), and missing entities return 404.

## Key elements

- **`registerLanguage`** – helper that `POST`s a language (`tag`, `name`, `nativeName`) to `/locales`, creating the row a translation slot requires.
- **`adminWithLanguages`** – authenticates as `admin` via `authenticateAs`, registers `en` (the fallback) and `it`, and returns the admin session.
- **Test suite (`describe` block)** – four cases covering: fallback write mutates the row, non-fallback write stores a slot but leaves the row, an undeclared field (`body`) is refused with 422, and a non-existent ID yields 404.

## Relationships

- **`src/modules/example/tests/factories.ts`** – supplies `createExample` (inserts a test row) and `fieldOf` (reads a field back from the DB for assertions).
- **`tests/support/http.ts`** – supplies `api` (the HTTP client used for all requests) and `authenticateAs` (obtains a bearer token for a named user).
- **`tests/support/setup-test-db.ts`** – supplies `setupTestDb`, invoked at module top-level to initialise the test database before any test runs.

## Notes

- The test assumes `en` is the **fallback** language; only writes to the fallback touch the row's own `title` field. This is a convention enforced by the `locales` module, not by this test.
- The 422 case depends on the `example` module having registered only `title` (not `body`) as translatable — the test does not declare which fields are allowed.
- Uses the `@tests/` import alias for test-support files (not the relative path).
