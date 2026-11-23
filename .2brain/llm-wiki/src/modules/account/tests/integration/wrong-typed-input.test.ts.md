---
source: src/modules/account/tests/integration/wrong-typed-input.test.ts
source_sha256: dfd5b303bec6a7a8d24b0ec04a5e2a5ad522ae766b85ef85b047612baa2e6f77
context_sha256: 15734782a2660477def6808ea12388d4df4b92d6117c1194dac45ac552475d9a
generated_at: 2026-11-22T04:03:25.596185+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/wrong-typed-input.test.ts

## Purpose
Integration test asserting that a wrong-typed `email` sent to `POST /account/email-change` yields a 422 validation response rather than a 500. The module comment notes the step-up guard runs before the body is read, so validation receives whatever the client sent.

## Key elements
- `setupTestDb()` — called at module top level to prepare the test database.
- `describe('POST /account/email-change with a wrong-typed email')` — a single parameterized suite using `it.each`.
- Test cases for `email`: a number (`5`), an object (`{ address: 'a@example.com' }`), an array (`['a@example.com']`), a boolean (`true`), and `null`.
- Each case authenticates as `'user'` via `authenticateAs`, posts `{ email }` with the returned `bearer` as the `Authorization` header, and expects `response.status` to be `422`.

## Relationships
- `tests/support/http.ts` — provides `api()` (the request builder used to send the POST) and `authenticateAs()` (returns the `bearer` token), imported through the `@tests/http` alias.
- `tests/support/setup-test-db.ts` — provides `setupTestDb()`, imported through the `@tests/setup-test-db` alias.

## Notes
- Only the status code is asserted; the response body is not checked.
- The request is authenticated as a regular `'user'`, so the test exercises the path past the step-up guard to body validation.
