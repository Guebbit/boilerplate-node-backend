---
source: src/modules/account/tests/integration/wrong-typed-input.test.ts
sha256: dfd5b303bec6a7a8d24b0ec04a5e2a5ad522ae766b85ef85b047612baa2e6f77
generated_at: 2026-11-14T19:13:34.321503+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/wrong-typed-input.test.ts

## Purpose

Integration test that guarantees `POST /account/email-change` returns **422** (not 500) when the `email` field is sent as a wrong type. Because the step-up guard runs *before* the request body is parsed, whatever the client puts in `email` reaches validation as-is; this test pins that no type causes an unhandled crash.

## Key elements

- **`describe('POST /account/email-change with a wrong-typed email')`** – Top-level suite; scopes the test to the single endpoint under test.
- **`it.each([...])('answers 422 for %s, not 500', …)`** – Parameterized case that sends each of five malformed `email` values (number, object, array, boolean, `null`) and asserts `response.status === 422`.
- **`setupTestDb()`** – Called once at module scope to seed/prepare the test database before any test runs.
- **`authenticateAs('user')`** – Obtains a bearer token for the test fixture user.
- **`api().post('/account/email-change')`** – Issues the actual HTTP request with the crafted body.

## Relationships

- **`tests/support/http.ts`** – Source of `api` (HTTP client helper) and `authenticateAs` (auth helper). The test file imports both and depends on their contracts (e.g., `api()` returns a request agent, `authenticateAs` returns `{ bearer }`).
- **`tests/support/setup-test-db.ts`** – Source of `setupTestDb`, which the test calls once at the top level to prepare the database schema/data for the suite.

## Notes

- The module docblock calls out *why* this test exists beyond "bad input → 400": the step-up guard ordering means the body is not pre-sanitised, so a wrong-typed value flows straight into the validation layer. The regression being guarded is a 500, not merely a 400.
- Each `it.each` entry carries a human-readable label (`_label`) that appears in failure output but is otherwise unused (underscore-prefixed).
- No network mocks are used; this is a true integration test against a live (test) server and database.
