---
source: src/modules/users/tests/contract/api.contract.test.ts
sha256: d7510ef1c504722a4f01f5ae45cb24071e8e089e03ba0c8d6af16bf26d4c7d10
generated_at: 2026-09-23T19:34:52.838582+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the user-facing endpoints (`/users`, `/users/{id}`, `/account`, `/account/signup`). Every response is validated against `openapi.yaml` via the `toSatisfyApiSpec()` matcher, and a string-level guard (`assertNoCredentials`) ensures no password, token, or bcrypt hash ever appears in a serialized body—regardless of field name.

## Key elements

- **`assertNoCredentials(payload)`** — serializes the response body and asserts it contains none of `"password"`, `"tokens"`, or `"$2b$"` (bcrypt prefix). Catches any undeclared credential field the OpenAPI `additionalProperties: false` might not cover.
- **`jest.mock('@infrastructure/observability/audit')`** — full module replacement (not `jest.spyOn`) that swaps `emitAuditEvent` with a `jest.fn()` and re-wires `recordAudit` to call the mock, because `recordAudit` closes over its own module-level reference.
- **`GET /users`** — contract + no-credentials check; also asserts each list item carries a `role` value matching the single-user endpoint.
- **`GET /users/{id}`** — contract + no-credentials check.
- **`GET /account`** — contract + no-credentials check; additionally asserts `Cache-Control: no-store`.
- **`POST /account/signup`** — 201 success contract, 409 duplicate-email error contract.
- **`POST /users`** (admin create) — covers password-supplied, `sendSetupEmail: true`, missing-credential 422, `sendSetupEmail: false` ≡ omitted, and breached-password 422 (verifies no DB row was created via `userRepository.findOne`).
- **`PUT /users/{id}`** — update without re-supplying password, avatar preservation, breached-password 422.
- **`DELETE /users/{id}`** — verifies the audit event carries `action: 'admin.user.soft_deleted'` (distinguishes soft delete from erasure).

## Relationships

- **`tests/support/contract.ts`** — imported as side-effect (`@tests/contract`); registers the `toSatisfyApiSpec()` jasmine/jest matcher that validates a response against the OpenAPI document.
- **`tests/support/http.ts`** — provides `api()` (supertest wrapper) and `authenticateAs(role)` (creates + logs in a test user, returns bearer token).
- **`tests/support/ports.ts`** — provides `observePort(fn)` which wraps a port function call in a spy-safe observer, working around the swc/CJS non-configurable-getter problem that blocks `jest.spyOn` on namespace imports.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` runs once before the suite to provision the in-memory test database.
- **`src/modules/users/tests/factories.ts`** — supplies `createUser`, `PLAIN_PASSWORD`, and the `userRepository` instance used to assert absence of a row after a rejected create.
- **`src/infrastructure/observability/audit.ts`** — fully mocked; the test spies on `emitAuditEvent` to assert the exact audit `action` string emitted on DELETE.
- **`src/modules/users/repository.ts`** — `userRepository` (from the same module) is queried in the breached-password POST test to confirm no document was persisted.

## Notes

- The audit mock is a **replacement**, not a spy. `jest.spyOn` cannot redefine the non-configurable getter that a CommonJS namespace import exposes under swc; the factory in `tests/support/ports.ts` (`observePort`) is the sanctioned workaround.
- `recordAudit` must be explicitly re-wired in the mock because it closes over its _own_ module's `emitAuditEvent`; without the override, spying on the exported `emitAuditEvent` would be blind to `recordAudit` call-sites.
- `assertNoCredentials` is a blunt string search over the entire JSON. It will false-positive if any legitimate string value (e.g. a username) contains the words "password" or "tokens"—a known trade-off accepted for the security guarantee.
- The `?role=` filter on `GET /users` was **deliberately removed** (role moved to a membership store) and is not re-tested here.
- Several tests carry `B25:` comments referencing a security-audit checklist item; they guard against regression of password-breach rejection on create and update paths.
