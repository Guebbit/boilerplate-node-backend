# src/modules/account/tests/integration/service-flows.test.ts

## Purpose

Integration tests for the "ordinary path" flows of the account service: signup, login, tokenAdd, passwordChange, and refreshAccessToken. It is the complement to the sibling `service.test.ts` (which covers security invariants like indistinguishable login failures and soft-delete rejection). Every test drives a real database via `setupTestDb` because the service decisions are made against stored user documents, not mocked ones.

## Key elements

- **`describe('accountService.signup')`** — verifies successful creation, password-mismatch rejection (422), duplicate-email rejection (409), invalid-email rejection (422), and short-password rejection (422).
- **`describe('accountService.login')`** — verifies success with correct credentials, 401 for wrong password, 401 for unknown email, and 401 for soft-deleted users.
- **`describe('accountService.tokenAdd')`** — verifies a 32-char token string is returned, the token is persisted to the user document, and an expiration date is set when `expirationTime` is supplied.
- **`describe('accountService.passwordChange')`** — verifies success, mismatch rejection (422), short-password rejection (422), and an end-to-end check that the new password can authenticate.
- **`issueRefreshToken` (local helper)** — creates a user and issues a real stored refresh token via `createRefreshToken`, returning the raw token string.
- **`describe('accountService.refreshAccessToken')`** — verifies three outcomes: successful exchange (access token + audit event), unparseable token (throw + `invalid_token` audit), and revoked token (throw + audit). Sets JWT environment secrets in `beforeEach` and restores them in `afterEach`.
- **`jest.mock('@infrastructure/observability/audit')`** — replaces the audit port's `emitAuditEvent` with a jest fn (full-replace, not spy).

## Relationships

- **`src/modules/account/services/index.ts`** — the code under test; imported as both `accountService` (namespace) and `account` (alias) to reach `refreshAccessToken` which is published on the service object.
- **`src/modules/account/session/jwt.ts`** — `createRefreshToken` is called to produce a real signed token for the refresh tests.
- **`src/modules/account/audit.ts`** — `accountAuditActions` enum supplies the expected action constants in audit assertions.
- **`src/infrastructure/observability/audit.ts`** — mocked module; `emitAuditEvent` is asserted on after each refresh call.
- **`src/modules/users/index.ts`** — `userRepository` is used to re-fetch documents and verify persistence (tokens, credentials).
- **`src/modules/users/model.ts`** — `UserDocument` type used in response type assertions.
- **`src/modules/users/tests/factory.ts`** — `createUser` and `PLAIN_PASSWORD` provide consistent test fixtures.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the in-memory/real DB before all suites.
- **`tests/support/caller-context.ts`** — `testCallerContext` supplies a valid caller for API-style calls.
- **`tests/support/ports.ts`** — `observePort` wraps the mocked audit fn to produce a jest spy for assertions.
- **`src/infrastructure/http/response.ts`** — `ResponseSuccess` / `ResponseReject` types used to narrow the service return values in assertions.

## Notes

- **Audit port is replaced, not spied on.** `jest.spyOn` cannot redefine the non-configurable getter that a CommonJS namespace import exposes; this breaks under the swc transform and Stryker's sandbox. The full rationale lives in `tests/support/ports.ts`.
- **JWT secrets are set manually.** Unit tests do not load `.env`, so the `refreshAccessToken` block explicitly sets `NODE_TOKEN_*` vars in `beforeEach` and restores the originals in `afterEach`.
- **Status code convention.** All validation failures return **422** (not 400), matching `openapi.yaml`; 400 is never declared there.
- **Duplicate import alias.** `import { accountService as account }` is a second import of the same module, used specifically to access `refreshAccessToken` through the published service object rather than the barrel re-export.
- **Placement.** The file lives under `account/tests/integration/` (not `users/`) because the code under test belongs to the account domain, even though it reads from the users repository.
