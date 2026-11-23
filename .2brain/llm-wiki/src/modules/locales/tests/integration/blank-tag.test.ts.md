---
source: src/modules/locales/tests/integration/blank-tag.test.ts
source_sha256: e432125c0282f68cb208d00804d87552f5b644dfe1f3bea7a199a124b60ca656
context_sha256: 15734782a2660477def6808ea12388d4df4b92d6117c1194dac45ac552475d9a
generated_at: 2026-11-22T05:49:40.015462+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/tests/integration/blank-tag.test.ts

## Purpose
Integration test guarding a regression: a `{locale}` path segment that is blank once trimmed (`/locales/%20`) must produce a normal response rather than hang. The tag normalizes to `''`, which matches no language id, so the write falls into the ordinary 404 path.

## Key elements
- `setupTestDb()`: called at module top level to prepare the test database for the suite.
- `describe('PATCH /locales/{locale} with a blank tag')`: the single suite.
- `it('answers 404 to PATCH')`:
  - Authenticates as `admin` via `authenticateAs('admin')` and takes the `bearer` token.
  - Sends `PATCH /locales/%20` with the `Authorization` header and body `{ name: 'Blank' }`.
  - Asserts the response status is `404`.
  - Has an explicit 15-second timeout (`15_000`), which makes a hang show up as a test failure.

## Relationships
- `tests/support/setup-test-db.ts` (imported as `@tests/setup-test-db`): provides `setupTestDb`, which sets up the database for this test.
- `tests/support/http.ts` (imported as `@tests/http`): provides `api()`, the HTTP client used to issue the request, and `authenticateAs()`, which returns the admin bearer token.

## Notes
- The `%20` is a URL-encoded space. The test relies on the server trimming and normalizing it to an empty tag.
- Only `PATCH` is covered, despite the module docstring speaking of "the write".
