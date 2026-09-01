# src/modules/account/tests/integration/service-flows.test.ts

## Purpose

Integration tests for the account service's happy paths and argument-level rejections: signup, login, token add, password change, and refresh-access-token. Complements the sibling `service.test.ts` (which covers security invariants) by exercising the ordinary success and validation-failure flows against a real database via `setupTestDb`.

## Key elements

- **`describe('accountService.signup')`** — verifies user creation, password mismatch, duplicate-email 409, invalid-format 422, short-password 422.
- **`describe('accountService.login')`** — verifies credential check, wrong-password 401, unknown-email 401, soft-deleted-user 401.
- **`describe('accountService.tokenAdd')`** — verifies token string generation, DB persistence, and expiration setting.
- **`describe('accountService.passwordChange')`** — verifies password rotation, mismatch 422, short-password 422, and that the new password actually enables login.
- **`describe('accountService.refreshAccessToken')`** — verifies successful refresh (with audit record), invalid-token rejection (`invalid_token`), and revoked-token rejection. Sets JWT secrets in `process.env` manually and restores them after.
- **`issueRefreshToken`** (local helper) — creates a user, mints a real signed refresh token via `createRefreshToken`, persists it, and returns the stored token string.
- **`jest.mock('@infrastructure/observability/audit', …)`** — replaces `emitAuditEvent` with `jest.fn()` so calls can be observed without spying on a non-configurable getter.

## Relationships

- **`src/modules/account/services/index.ts`** — the module under test; imported as `accountService` (namespace) for most flows and as `account` (alias) to reach `refreshAccessToken`, which is only exposed on the service object.
- **`src/modules/account/session/jwt.ts`** — `createRefreshToken` is called to produce a real signed token for the refresh-flow tests.
- **`src/modules/account/audit.ts`** — `accountAuditActions` constants are used in `expect` assertions on audit event payloads.
- **`src/infrastructure/observability/audit.ts`** — `emitAuditEvent` is mocked; observed via `observePort` from the ports helper.
- **`src/infrastructure/http/response.ts`** — `ResponseSuccess` / `ResponseReject` types are used for casting assertion targets.
- **`src/modules/users/index.ts` / `repository.ts`** — `userRepository` is used to seed users, verify token persistence, remove tokens (revocation), and re-fetch documents.
- **`src/modules/users/tests/fixtures.ts`** — `createUser` and `PLAIN_PASSWORD` supply test data.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the real database for the whole file.
- **`tests/support/caller-context.ts`** — `testCallerContext` is passed as the caller argument to service functions that require it.
- **`tests/support/ports.ts`** — `observePort` wraps a port function so individual calls can be inspected after execution.

## Notes

- **Audit mocking is a `jest.mock` replacement, not a `jest.spyOn`.** `jest.spyOn` cannot redefine the non-configurable getter that a CommonJS namespace import exposes; this fails under the swc transform in `jest.config.mutation.js` and inside Stryker's sandbox. See `tests/support/ports.ts` for the full rationale.
- **Status-code convention follows `openapi.yaml`:** validation failures are always **422** (the spec never declares 400), auth failures are **401**, conflicts are **409**.
- **Dual import style is intentional:** `accountService` (namespace) covers barrel-exported functions; `account` (aliased) exists solely to reach `refreshAccessToken`, which is attached to the service object rather than re-exported from the barrel.
- **`refreshAccessToken` tests set JWT secrets in `process.env`** (`NODE_TOKEN_ACCESS`, `NODE_TOKEN_REFRESH`, etc.) because unit-test runs do not load `.env`. The original values are saved/restored in `beforeEach`/`afterEach`.
- **Revocation is document-based, not signature-based:** the "revoked token" test removes the token from the user document via `userRepository.tokenRemoveByValue`, proving that a cryptographically valid token is still rejected once the user no longer holds it.
