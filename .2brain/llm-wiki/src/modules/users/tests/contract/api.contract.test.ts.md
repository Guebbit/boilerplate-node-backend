---
source: src/modules/users/tests/contract/api.contract.test.ts
sha256: d88e283b5c0ba60a3a87ebeabe20e0c59b3067a5cafb401a274a0cb287455fe0
generated_at: 2026-09-27T15:39:26.563593+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/users` and `/account` endpoints. Because `openapi.yaml` declares `additionalProperties: false` on the `User` schema, these tests verify that **no** undeclared field (password, tokens, a bcrypt hash) can leak into any user response — not just the ones a developer thought to name. They also pin endpoint-specific behavior: cache headers, HTTP status codes for error cases, PUT replace-vs-PATCH merge semantics, and password-provisioning rules on admin create.

## Key elements

- **`assertNoCredentials(payload)`** — serializes the response body to JSON and asserts it contains none of `password`, `tokens`, or `$2b$` (a bcrypt hash prefix).
- **`jest.mock('@infrastructure/observability/audit', …)`** — replaces the audit port entirely (not a spy) and reroutes `recordAudit` so a spy on `emitAuditEvent` still catches every call.
- **`describe('GET /users')`** — 200 status, no credentials, and each item carries `role` (regression guard for a `toJSON` transform that silently dropped it).
- **`describe('GET /users/{id}')`** — 200 status, no credentials.
- **`describe('GET /account')`** — 200 status, no credentials, and `cache-control: no-store`.
- **`describe('POST /account/signup')`** — 201 on success; 409 (not 422) on duplicate email.
- **`describe('POST /users')`** — admin create with direct password, with `sendSetupEmail: true`, and 422 when neither is supplied (or when `sendSetupEmail` is explicitly `false`).
- **`describe('PUT /users/{id}')`** — full-replace semantics (RFC 9110 §9.3.4): omitted optionals are cleared; `password` is never touched; missing required identity fields → 422; update without resubmitting a password.
- **`describe('PATCH /users/{id}')`** — partial-merge: sends only `{ role }`, leaves email/username/avatar untouched.

## Relationships

- **`tests/support/contract.ts`** — imported as a side-effect (`import '@tests/contract'`); likely registers OpenAPI-schema validation or global contract assertions.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module top-level to provision a clean database before any test runs.
- **`tests/support/http.ts`** — provides the `api()` supertest helper and `authenticateAs(role)` for obtaining bearer tokens.
- **`tests/support/ports.ts`** — supplies the `observePort` pattern used to replace (not spy) the audit port under swc/CommonJS.
- **`src/modules/users/tests/factories.ts`** — `createUser`, `PLAIN_PASSWORD`, and `userRepository` are used to seed test fixtures.
- **`src/modules/users/model.ts`** — `DEFAULT_USER_IMAGE_URL` is asserted after a PUT that omits `imageUrl`.
- **`src/infrastructure/observability/audit.ts`** — mocked via `jest.mock`; the real `buildAuditEvent` is still used inside the replacement `recordAudit`.

## Notes

- **Audit mock is a full replacement, not a spy.** `jest.spyOn` cannot redefine the non-configurable getter that a CommonJS namespace import exposes under swc. The replacement must also reroute `recordAudit` because it closes over its own module's `emitAuditEvent`, bypassing the top-level mock.
- **PUT vs PATCH.** PUT omits optionals → they are cleared (e.g. `imageUrl` resets to `DEFAULT_USER_IMAGE_URL`, `phone` becomes `undefined`). PATCH sends only the changed field and leaves everything else intact.
- **`sendSetupEmail: false` is equivalent to omitting it** — both result in 422 if no password is also supplied.
- **`?role=` filter is deliberately absent.** Role is a membership fact, not a document column; the two-step resolve `createRepository`'s `exact` spec cannot express. No current caller needs it.
- **Breach checks** (password-strength policies across every password-set path) live in a sibling file `tests/contract/password-set-paths.test.ts`, not here.
- **409 vs 422 on signup:** duplicate email is a conflict (409), not a validation error (422).
