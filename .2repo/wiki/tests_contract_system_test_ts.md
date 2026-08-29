# tests/contract/system.test.ts

## Purpose

Contract tests for the system-level routes (`GET /`) and the shared error envelopes (404, 422). Ensures that these responses conform to the OpenAPI / Zod spec defined in the contract layer, catching drift between the runtime response shape and the documented type.

## Key elements

- **`describe('GET /')`** — Asserts 200 status, `data.status === 'ok'`, and that the full body satisfies the API spec via `toSatisfyApiSpec()`.
- **`describe('error envelopes')`** — Two cases:
  - 404 on an unmatched route: verifies `success: false` and `errors` is an array.
  - 422 on `/account/login` with an invalid payload: verifies the body satisfies the API spec.
- **`setupTestDb()`** — Called at module scope; ensures a clean test database before any test runs.

## Relationships

- **`tests/support/contract.ts`** — Imported as `@tests/contract`; registers the `toSatisfyApiSpec()` Jest matcher that validates response bodies against the generated spec.
- **`tests/support/http.ts`** — Provides the `api()` helper used to issue HTTP requests (`.get`, `.post`, `.send`) within tests.
- **`tests/support/setup-test-db.ts`** — Provides `setupTestDb()`, which creates/resets the in-memory or SQLite test database required for route handlers that touch the DB.

## Notes

- The file's docstring records a past type bug: `GET /` was typed as `MessageResponse` but actually returned a flat `{ status: 'ok' }` shape. It has since been retyped to `HealthPingEnvelope`. If you see legacy references to `MessageResponse` on that route, they are stale.
- The 404 test asserts the envelope *structurally* (fields) rather than calling `toSatisfyApiSpec()`, while the 422 test *does* call it. This is intentional asymmetry—don't "fix" one to match the other without checking whether the spec actually covers that status code.
