---
source: src/modules/account/tests/integration/service-flows.test.ts
source_sha256: 7d82f89d3395eeafcf568d9cc85d0bd32385d3cbd0148e2e1d15d323bab80839
context_sha256: f06785c68ccfaa99878ba966490da9d07f6d545b420c4b581fcb6f10c81d2baa
generated_at: 2026-11-22T04:00:41.742222+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/service-flows.test.ts

## Purpose
Integration tests for the ordinary (happy-path and argument-validation) flows of `accountService` in `src/modules/account/services/index.ts`: signup, login, one-time token issuance, password change, and (further in the file) refresh-token exchange. It complements the sibling `service.test.ts`, which covers security invariants. Tests run against a real database via `setupTestDb()`, and live under `account` because the code under test belongs to `account`.

## Key elements
- **`jest.mock('@infrastructure/observability/audit', ...)`**: replaces the audit port with `auditPortMock()` from `@tests/ports` instead of using `jest.spyOn`. Spying fails on CommonJS namespace getters under the swc mutation config and in Stryker's sandbox.
- **`setupTestDb()`**: sets up the real test database.
- **`describe('accountService.signup')`**: covers success, mismatched passwords, 409 `EMAIL_ALREADY_USED`, 422 for an invalid email, 422 for a too-short password, and 422 for a breached password (`Password1!`). The breached case is the only one proving `signup` calls `assertPasswordNotBreached`.
- **`describe('accountService.login')`**: covers success, and 401 for a wrong password, an unknown email, and a soft-deleted user.
- **`describe('issueToken')`**:
  - returns a 32-character plaintext token;
  - stores only the `hashToken` digest plus the token kind;
  - sets the expiry from the given lifetime;
  - a `password` token replaces the previous one, while `mfa-challenge` tokens accumulate.
- **`describe('passwordChange')`**: covers success, 422 on mismatch, 422 when too short, and a check that the new password works for a later login.
- **`issueRefreshToken()`**: local helper that creates a user and returns the value from `startSession(user.id, ['pwd'])`. The stored row only holds a digest, so the helper keeps the plaintext JWT.
- **`describe('accountService.refreshAccessToken')`**: exercises the three outcomes of exchanging a refresh cookie with a real signed token. Its `beforeEach` sets token secrets through `setEnvironment`. The rest of the file is not shown here.

## Relationships
- Calls `accountService` from `src/modules/account/services/index.ts`, plus `issueToken` (`src/modules/account/services/tokens.ts`) and `passwordChange` (`src/modules/account/services/password.ts`) directly.
- Uses `startSession` and `verifyAccessToken` from `src/modules/account/session/jwt.ts`.
- Uses `createUser`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD` and `userRepository` from `src/modules/users/tests/factories.ts`. Uses `tokenRowsOf` and `dropSessionOf` from `src/modules/account/tests/factories.ts`.
- Uses `hashToken` (`src/infrastructure/security/hash-token.ts`) to check that stored digests match.
- Asserts on `ResponseSuccess` and `ResponseReject` shapes from `src/infrastructure/http/response.ts`. Uses the `UserDocument` type from `src/modules/users/index.ts`.
- Imports `accountAuditActions` (`src/modules/account/audit.ts`) and `authRefreshReuseTotal` (`src/modules/account/metrics.ts`), which the refresh section uses together with the mocked audit port (`src/infrastructure/observability/audit.ts`) and `observePort` from `@tests/ports`.
- Uses `testCallerContext` from `tests/support/callers.ts`, `setEnvironment` from `@tests/environment`, and `setupTestDb` from `@tests/setup-test-db`.

## Notes
- Validation failures return 422, including auth ones, because `openapi.yaml` declares 422 and never 400.
- `PLAIN_PASSWORD` is documented as deliberately not the breached `Password1!`, so that value stays available for the breached-password test.
- Secrets are set in the test because unit tests don't load dotenv.
- Verification consults the user document, so a stubbed verifier would let a revoked token pass. That is why refresh tests use real signed tokens.
