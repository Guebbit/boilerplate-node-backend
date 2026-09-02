# src/modules/account/tests/integration/service-flows.test.ts

## Purpose

Integration tests for the `account` service's ordinary (non-security) flows: signup, login, token addition, password change, and access-token refresh. Drives a real database via `setupTestDb` to verify end-to-end behavior, including persistence side-effects. The sibling `service.test.ts` covers security invariants; this file covers the happy paths and argument-level rejections those invariants sit on.

## Key elements

- **`describe('accountService.signup')`** — verifies success (user created, email returned) and rejections: mismatched passwords (422), duplicate email (409), invalid email format (422), short password (422).
- **`describe('accountService.login')`** — verifies success (correct credentials), wrong password (401), non-existent email (401), and soft-deleted user (401).
- **`describe('accountService.tokenAdd')`** — verifies token string format (32 chars), persistence to the user document, and expiration-date setting.
- **`describe('accountService.passwordChange')`** — verifies success, mismatched-password rejection (422), too-short rejection (422), and that the new password actually works for subsequent login.
- **`issueRefreshToken`** (local helper) — creates a user and returns a real signed refresh token via `createRefreshToken`.
- **`describe('accountService.refreshAccessToken')`** — verifies access-token issuance, audit-event emission, refresh-token rotation (old token invalidated), and that `auth_time` stays stable across ten consecutive refreshes. Manages JWT env vars (`NODE_TOKEN_*`) in `beforeEach`/`afterEach` because unit tests do not load dotenv.
- **`jest.mock('@infrastructure/observability/audit', …)`** — replaces the audit port's `emitAuditEvent` with a `jest.fn()` (see Notes).
- **`ENV_KEYS` / `originalEnvironment`** — snapshot-and-restore pattern for the five `NODE_TOKEN_*` environment variables.

## Relationships

- **`src/modules/account/services/index.ts`** — the module under test. Imported twice: as a namespace (`accountService`) for most calls, and as a named object (`account`) to reach `refreshAccessToken`, which is published on the service object rather than exported as a bare name.
- **`tests/support/setup-test-db.ts`** — called once at module level to provision a real test database for all suites in this file.
- **`tests/support/caller-context.ts`** — provides `testCallerContext` passed to service calls that require caller metadata.
- **`tests/support/ports.ts`** — provides `observePort`, used to capture audit-event calls on the mocked audit port.
- **`src/infrastructure/observability/audit.ts`** — mocked via `jest.mock`; `emitAuditEvent` is the single replaced export.
- **`src/modules/account/audit.ts`** — supplies `accountAuditActions` constants (e.g. `AUTH_TOKEN_REFRESHED`) used in audit-event assertions.
- **`src/modules/account/session/jwt.ts`** — supplies `createRefreshToken` (to mint real tokens) and `verifyAccessToken` (referenced in the module's comment context).
- **`src/modules/users/tests/fixtures.ts`** — supplies `createUser` and `PLAIN_PASSWORD` for seeding test data.
- **`src/modules/users/index.ts`** / **`src/modules/users/repository.ts`** — `userRepository.findByIdWithCredentials` and `findById` are used to assert persistence side-effects (tokens, password changes).
- **`src/modules/users/model.ts`** — `UserDocument` type used in `ResponseSuccess<UserDocument>` casts.
- **`src/infrastructure/http/response.ts`** — `ResponseSuccess` and `ResponseReject` types used to type-narrow service return values in assertions.

## Notes

- **Audit port is replaced, not spied on.** `jest.spyOn` cannot redefine the non-configurable getter a CommonJS namespace import exposes; this fails under the SWC transform in `jest.config.mutation.js` and inside Stryker's sandbox. The `jest.mock` factory + `observePort` pattern in `tests/support/ports.ts` is the workaround.
- **Status-code convention:** all validation failures return **422** (matching `openapi.yaml`, which never declares 400); auth failures return **401**; duplicate-resource conflicts return **409**.
- **`refreshAccessToken` access style:** it is reached via `account.refreshAccessToken(…)` (object property), not as a bare import, because the services barrel publishes it on the service object rather than re-exporting it as a top-level name.
- **JWT env vars are set manually** in `beforeEach`/`afterEach` with snapshot-and-restore, because the test runner does not invoke `dotenv` the way the application does.
- **File location rationale:** lives under `account/tests/integration/` (not alongside `users` tests) because the code under test belongs to the `account` module, even though the tests seed data through the `users` fixtures.
