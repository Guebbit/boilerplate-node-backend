---
source: src/modules/users/tests/contract/api.contract.test.ts
sha256: 5a117466a1ed1302e825c577661caa2307cb294b43c16ab08fb4875877d711e9
generated_at: 2026-10-15T12:12:40.228606+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/contract/api.contract.test.ts

## Purpose

Contract tests that act as a credential-leak guard for the user-facing API (`/users`, `/account`). Because `openapi.yaml` declares `additionalProperties: false` on the `User` schema, any undeclared field (a plaintext password, an argon2 hash, a consent flag) in a response body fails here regardless of whether a test author thought to name it. The file also pins semantic contracts: correct status codes, PUT-as-full-replace behavior, and the requirement that `GET /account` sends `Cache-Control: no-store`.

## Key elements

- **`assertNoCredentials(payload)`** – Serializes a response body to JSON and asserts the string contains neither `"password"` nor `"$argon2"`. Applied to every response body in the file.
- **`jest.mock('@infrastructure/observability/audit', …)`** – Full port replacement (not `jest.spyOn`) so that `emitAuditEvent` is a `jest.fn()`. Because `recordAudit` closes over its own module-level `emitAuditEvent`, the mock re-routes it through the replacement to keep both call sites observable.
- **`describe('GET /users')`** – Verifies 200, no credentials, and that every item carries a resolved `role` (regression: list serialization once skipped the membership lookup).
- **`describe('GET /users/{id}')`** – Same credential-leak check on the detail endpoint.
- **`describe('GET /account')`** – Credential-leak check plus `cache-control: no-store` header assertion.
- **`describe('POST /account/signup')`** – 201 + no credentials on success; 409 (not 422) on duplicate email.
- **`describe('POST /users')`** – Admin-created account carries no password and no `sendSetupEmail` toggle. Asserts `USER_SETUP_REQUESTED` domain event fires with the new user's id. Parametrized 422 tests reject `password`, `sendSetupEmail`, `verifiedAt`, `analyticsConsent`, and `phone` in the body and verify no user row is created.
- **`describe('PUT /users/{id}')`** – Full-replace semantics (RFC 9110 §9.3.4): omitted optional fields are cleared, `imageUrl` is preserved (owned by the upload path). Required fields (`username`, `role`, `active`) must all be present. `email` and `password` in the body are rejected with 422 and the stored credentials are unchanged.

## Relationships

- **`tests/support/contract.ts`** – Imported for side-effect contract-test setup (schema validation wiring).
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initializes the test database before any test runs.
- **`tests/support/http.ts`** – Provides `api()`, `authenticateAs()`, `authenticateAsRole()` for authenticated Supertest requests.
- **`tests/support/ports.ts`** – Exports `observePort`; the file's inline `jest.mock` follows the replacement pattern documented there.
- **`src/modules/users/tests/factories.ts`** – Supplies `createUser`, `PLAIN_PASSWORD`, and the `userRepository` used for setup and post-condition assertions.
- **`src/infrastructure/observability/audit.ts`** – The module under mock; `emitAuditEvent` and `recordAudit` are re-routed so audit emissions remain assertable.
- **`src/kernel/events.ts`** – `markDomainEventsWired`, `onDomainEvent`, `resetDomainEvents` manage the in-memory domain-event bus for the `POST /users` test.
- **`src/kernel/outbox.ts`** – `settleOutboxNudges()` flushes outbox-driven side effects before assertions.
- **`src/modules/users/events.ts`** – Source of the `USER_SETUP_REQUESTED` event constant.
- **`src/modules/users/repository.ts`** – `userRepository` used to verify no row was created (422 cases) and to snapshot credentials before/after a rejected PUT.

## Notes

- The audit mock is a **replacement**, not a spy. `jest.spyOn` cannot redefine the non-configurable getter that a CommonJS namespace import exposes under the `swc` transform. If you add new audit assertions, call `emitAuditEvent` mock directly.
- `recordAudit` in the real module closes over its *own* `emitAuditEvent` binding, so the mock must explicitly re-route it; simply spreading `actual` is not enough.
- The `?role=` query filter was intentionally removed (role is a membership fact, not a document column) and **not** re-implemented in these tests.
- PUT is a full replace, not a partial patch. The only field exempted is `imageUrl`, which is managed by the upload flow.
- Password-set paths (including their breach checks) are covered in a separate file: `tests/contract/password-set-paths.test.ts`. `POST /users` is explicitly **not** one of them.
