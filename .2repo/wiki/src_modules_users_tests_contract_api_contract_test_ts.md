# src/modules/users/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/users` and `/account` endpoints that enforce the OpenAPI schema (via `toSatisfyApiSpec()`) and, critically, guarantee that no credential material—passwords, tokens, bcrypt hashes—ever appears in a response body. The `additionalProperties: false` constraint on the `User` schema is the primary guard; these tests make that constraint executable.

## Key elements

- **`assertNoCredentials(payload)`** — Serializes a response body and asserts the string contains none of `'password'`, `'tokens'`, or `'$2b$'` (a bcrypt hash). Applied to every success and error body in the file.
- **`usernames(response)`** — Extracts the `username` array from a paginated `/users` body for membership assertions.
- **`GET /users`** — 200, spec-conformant, no credentials.
- **`GET /users?admin=true` / `?verified=false`** — Asserts role filters narrow results by membership (not exact list) against fixtures created in-test.
- **`GET /users/{id}`** — 200, spec-conformant, no credentials.
- **`GET /account`** — 200, spec-conformant, no credentials, and `cache-control: no-store` header present.
- **`POST /account/signup`** — 201 on success; 409 (not 422) on duplicate email.
- **`POST /users` (admin create)** — Four cases covering password provisioning: password supplied, `sendSetupEmail: true`, neither (→ 422), and `sendSetupEmail: false` (treated same as omitted → 422).
- **`PUT /users/{id}`** — Regression guard: update succeeds without resubmitting a password.
- **`DELETE /users/{id}`** — Verifies audit action is `admin.user.soft_deleted` by default and `admin.user.erased` when `?hardDelete=true`, with matching `metadata.hardDelete` flag.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/contract.ts` | Imported as `@tests/contract`; registers the `toSatisfyApiSpec()` jest matcher used in every assertion. |
| `tests/support/http.ts` | Provides the `api()` supertest wrapper and `authenticateAs(role)` helper used to issue requests. |
| `tests/support/ports.ts` | Provides `observePort()` to obtain a jest mock reference after `jest.mock` replaces the audit module. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` is called at module load to provision a clean test database. |
| `src/modules/users/tests/fixtures.ts` | `createUser()` creates ad-hoc user records for filter and mutation tests. |
| `src/infrastructure/observability/audit.ts` | Replaced (via `jest.mock`) so `emitAuditEvent` becomes a `jest.fn`; the real module is still required for its other exports. |

## Notes

- **Audit mock technique:** The audit port is *replaced* with `jest.mock`, not spied via `jest.spyOn`. A comment in the file explains that swc emits a non-configurable getter on CommonJS namespace imports, which prevents `spyOn` from redefining `emitAuditEvent`.
- **Credential check is substring-based:** `assertNoCredentials` stringifies the whole body and checks for substrings. This catches bcrypt hashes (`$2b$`) regardless of the field name they land in, but it also means a legitimate username containing the word "password" would false-positive.
- **Role-filter tests use membership, not exact lists:** The authenticated admin is a shared fixture; pinning the full page would break when that fixture changes.
- **409 vs 422 on signup:** 409 means the request is well-formed but the email is taken; 422 means the payload is structurally invalid (e.g., missing password). The tests intentionally distinguish these.
- **`sendSetupEmail: false` ≡ omitted:** Both require an explicit `password` field or the request 422s. There is no "create with no password, no email" path.
- **`/account` `no-store` assertion:** Tied to the `noStore` middleware in `infrastructure/http/middlewares/cache.ts`; a browser must not cache the caller's own profile.
