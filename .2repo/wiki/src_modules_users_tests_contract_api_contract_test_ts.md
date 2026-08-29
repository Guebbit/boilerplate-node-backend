# src/modules/users/tests/contract/api.contract.test.ts

## Purpose

Contract tests that validate user-facing API responses (`/users`, `/users/{id}`, `/account`, `/account/signup`) against the OpenAPI spec via `toSatisfyApiSpec()`, with an explicit credential-leak guard (`password`, `tokens`, bcrypt hashes) layered on top. The contract check catches *any* undeclared field; the explicit assertions document intent for the known historical leak.

## Key elements

- **`assertNoCredentials(payload)`** — serializes the payload and asserts it contains none of the strings `password`, `tokens`, or `$2b$`. Applied to every successful user/account response.
- **`GET /users`** — verifies 200, spec conformance, and no credentials.
- **`GET /users?admin=true` / `?verified=false`** — confirms the role filter query params return the expected membership (asserted by inclusion/exclusion, not exact list, to avoid coupling to fixture state).
- **`GET /users/{id}`** — same contract + credential assertions for a single-user endpoint.
- **`GET /account`** — additionally asserts `cache-control: no-store` header, and that an unauthenticated request returns a 401 that also matches the error schema.
- **`POST /account/signup`** — 201 success and 409 duplicate-email error, both validated against the spec with the credential guard.
- **`usernames(response)`** — small helper that extracts the `username` array from a paginated list response for membership assertions.

## Relationships

- **`tests/support/contract.ts`** (imported as `@tests/contract`) — registers the `toSatisfyApiSpec()` Jest matcher that compares a response body/headers against `openapi.yaml`.
- **`tests/support/http.ts`** (imported as `@tests/http`) — supplies the `api()` Supertest wrapper and `authenticateAs(role)` helper that returns a bearer token (and optionally a `user` object).
- **`tests/support/setup-test-db.ts`** — called at module load to create/tear down a per-test database.
- **`src/modules/users/tests/factory.ts`** — `createUser()` is used to seed `plain-verified` and `plain-unverified` fixtures for the role-filter test.

## Notes

- The explicit credential assertions are intentionally redundant with the contract check; they exist as a readable statement of intent. The contract check (`additionalProperties: false` on the `User` schema) is the general guard.
- The 409 duplicate-email test was written *before* the spec declared that status code — it drove the spec update.
- Role-filter assertions use `toContain`/`not.toContain` on the username list rather than an exact-array match, so the test stays green when unrelated fixtures change.
- `setupTestDb()` runs at import time (not inside a `beforeEach`), meaning the DB is set up once for the whole file.
