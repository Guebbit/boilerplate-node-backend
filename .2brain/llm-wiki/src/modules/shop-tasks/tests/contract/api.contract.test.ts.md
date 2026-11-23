---
source: src/modules/shop-tasks/tests/contract/api.contract.test.ts
source_sha256: 30415aa16256f418a0926b7f478c06a670aa868b5df94076cd2721ead077a21e
context_sha256: 5dcf1a4b1c0732691af0e24f2d27740c1bd042d5b6064928f296a51e5efd56a5
generated_at: 2026-11-22T07:44:09.625723+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/shop-tasks/tests/contract/api.contract.test.ts

## Purpose
Contract tests for the `GET /shop-tasks/summary` endpoint. They check that the endpoint responds successfully for an administrator and for a role that opens fewer screens (`warehouse`), and that the response is never stored by a shared cache.

## Key elements
- `setupTestDb()`: called once at module level to prepare the test database.
- `describe('GET /shop-tasks/summary')`: groups three tests, each of which authenticates and sends a GET request with the bearer token in the `Authorization` header.
  - **Administrator**: authenticates via `authenticateAs('admin')` and expects status `200`.
  - **Restricted role**: authenticates via `authenticateAsRole('warehouse')` and expects status `200`.
  - **Caching**: authenticates as `admin` and expects the `cache-control` header to match `/no-store/`.

## Relationships
- `@tests/contract` (`tests/support/contract.ts`): imported only for its side effects (`import '@tests/contract'`). The file's header comment says the tests check the response against the schema, but no schema assertion appears in this file, so that check presumably happens through this import.
- `@tests/http` (`tests/support/http.ts`): provides `api()` (the HTTP client used for requests), `authenticateAs`, and `authenticateAsRole`. The last two return an object with a `bearer` value.
- `@tests/setup-test-db` (`tests/support/setup-test-db.ts`): provides `setupTestDb()`.

## Notes
- The only explicit assertions in the file are the status code and the `cache-control` header. Schema conformance is not asserted directly here.
- The three tests send the same request and differ only in the authenticated identity and the assertion.
