# src/modules/users/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/users` and `/account` endpoints. Each successful response is validated against the OpenAPI spec (`toSatisfyApiSpec`) and, via a custom `assertNoCredentials` guard, checked that no credential material (password strings, token fields, bcrypt hashes) leaks into the serialized body. The suite also pins down role-filter query parameters, the password-provisioning rules on admin create, and a few error-status contracts (401, 409, 422).

## Key elements

- **`assertNoCredentials(payload)`** – Serializes the response body to JSON and asserts it contains none of the literal substrings `password`, `tokens`, or `$2b$`. Broader than a field-name check; catches any nested value that smuggles a hash in.
- **`usernames(response)`** – Pulls the `username` array out of a paginated `/users` body for filter assertions.
- **`describe('GET /users')`** – 200 + spec match + no credentials.
- **`describe('GET /users — the role filters')`** – Verifies `?admin=true` and `?verified=false` narrow results as the schema promises; asserts by membership (`toContain` / `not.toContain`), not by exact page contents.
- **`describe('GET /users/{id}')`** – Same contract + credential guard for the single-resource route.
- **`describe('GET /account')`** – 200 + spec + no credentials + `cache-control: no-store`; also a 401 error-contract case.
- **`describe('POST /account/signup')`** – 201 happy path; 409 for a duplicate email (well-formed request, business-rule rejection).
- **`describe('POST /users')`** – Four cases covering password provisioning: direct password (201), `sendSetupEmail: true` (201), neither (422), and `sendSetupEmail: false` treated identically to omitting it (422).
- **`describe('PUT /users/{id}')`** – Regression guard: an admin update must succeed without resubmitting a password.

## Relationships

- **`tests/support/contract.ts`** (`@tests/contract`) – Registers the `toSatisfyApiSpec` jest matcher used on every assertion.
- **`tests/support/http.ts`** (`@tests/http`) – Provides `api()` (supertest wrapper) and `authenticateAs(role)` for obtaining bearer tokens.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is called at module top-level to seed a clean database before the suite runs.
- **`src/modules/users/tests/fixtures.ts`** – `createUser` creates ad-hoc user rows (e.g. `plain-verified`, `plain-unverified`, `editnocredential`) for filter and update tests.

## Notes

- `assertNoCredentials` is a **substring scan on the JSON-serialized body**, not a field-by-field check. Any response field whose *value* contains the word "password" (e.g. a field named `passwordConfirm` echoing back) will trip it, even if the intent is benign.
- The role-filter test deliberately does **not** assert an exact user list; the authenticated admin is a fixture owned elsewhere, so pinning the full page would break on unrelated fixture changes.
- The 409-vs-422 split on `POST /account/signup` is intentional: 409 means "valid request, address already taken"; 422 means "malformed or missing required input."
- `sendSetupEmail: false` is **semantically identical to omitting the flag** (both require a direct password or the request is rejected with 422). This is called out explicitly by a dedicated test.
- The `PUT /users/{id}` test is a regression guard for a historical bug where `requirePassword` defaulted to `true` on updates, blocking password-less edits.
