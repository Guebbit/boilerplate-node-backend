---
source: src/modules/account/tests/integration/service-flows.test.ts
sha256: 485cf8c77332cf3486c0ce83411ce4772cbbd3df2ffe0a532666d33bbd314ae7
generated_at: 2026-10-14T09:14:11.743103+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/service-flows.test.ts

## Purpose

Integration tests for the ordinary (non-security) paths of `accountService`: signup, login, one-time token issuance, and password change. Drives a real database via `setupTestDb` and asserts the happy-path responses plus argument-level rejections (422, 401, 409). Sits alongside `service.test.ts`, which owns the security invariants, and lives under `account` rather than `users` because the code under test is account's.

## Key elements

- **`describe('accountService.signup')`** — verifies user creation, password-match rejection, duplicate-email 409, invalid-email 422, short-password 422, and breached-password 422.
- **`describe('accountService.login')`** — verifies successful login, wrong-password 401, unknown-email 401, and soft-deleted-user 401.
- **`describe('accountService.issueToken')`** — verifies plaintext return (32 chars), digest-only persistence with `hashToken`, expiry timing, and one-live vs. many-live link replacement semantics.
- **`describe('accountService.passwordChange')`** — verifies successful change, mismatch 422, short-password 422, and that the new password actually works for subsequent login.
- **`issueRefreshToken`** — helper that creates a user and calls `startSession`, returning the real JWT (the stored row holds only a `hashToken` digest).
- **`jest.mock('@infrastructure/observability/audit')`** — replaces the audit port (see Notes).
- **`setupTestDb()`** — bootstraps a real database for the whole file.

## Relationships

- **`src/modules/account/services/index.ts`** — the `accountService` under test; every `describe` block calls its methods.
- **`src/modules/account/session/jwt.ts`** — `startSession` (via `issueRefreshToken`) and `verifyAccessToken` are imported for refresh-token flow tests.
- **`src/infrastructure/http/response.ts`** — `ResponseSuccess` / `ResponseReject` types shape every assertion on service return values.
- **`src/infrastructure/security/hash-token.ts`** — `hashToken` used to assert that only the digest is persisted for one-time tokens.
- **`src/infrastructure/observability/audit.ts`** — fully replaced by `jest.mock`; `observePort` from `tests/support/ports.ts` is the intended observation mechanism.
- **`src/modules/account/audit.ts`** — `accountAuditActions` imported (likely for audit-event assertions in refresh tests).
- **`src/modules/account/metrics.ts`** — `authRefreshReuseTotal` imported for Prometheus metric assertions.
- **`src/modules/users/tests/factories.ts`** — `createUser`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD`, `userRepository`.
- **`src/modules/account/tests/factories.ts`** — `tokenRowsOf`, `dropSessionOf` for token-row inspection and cleanup.
- **`tests/support/callers.ts`** — `testCallerContext` passed to every service call.
- **`tests/support/environment.ts`** — `setEnvironment` for environment-dependent setup.
- **`tests/support/ports.ts`** — `observePort` and the documented reasoning behind the audit-port replacement pattern.

## Notes

- **Audit port is *replaced*, not spied on.** `jest.spyOn` cannot redefine the non-configurable getter a CommonJS namespace import exposes; this breaks under the SWC transform in `jest.config.mutation.js` and inside Stryker's sandbox. The mock also re-routes `recordAudit` (which closes over its own `emitAuditEvent`) through the replacement spy so every call is visible. See `tests/support/ports.ts` for full reasoning.
- **422, not 400, for all validation failures.** `openapi.yaml` declares 422 for auth/validation errors and never declares 400.
- **`PLAIN_PASSWORD` is intentionally a breached password.** It is listed in `breached-passwords/list.txt` so the signup breach-rejection test can prove `assertPasswordNotBreached` is actually invoked in the flow.
- **Token assertions use the stored row, not the return value.** The DB row holds a `hashToken` digest; the plaintext JWT only exists in the service's return value (or `startSession`'s return). Never re-read the JWT from storage.
