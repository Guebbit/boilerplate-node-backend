# src/modules/account/tests/integration/service.test.ts

## Purpose

Integration tests for the account service (`accountService`) that pin down **security invariants** rather than happy-path behavior. Tests are grouped by the invariant each defends — indistinguishable login failures, soft-delete enforcement, and password hashing — so that a regression in any of them is caught even when every "normal" flow still passes.

## Key elements

- **`describe('signup')`** — verifies account creation, asserts the stored password matches `^\$2[aby]\$` (bcrypt), rejects mismatched confirmation (422), duplicate email (409), invalid input (422), and that an absent `imageUrl` is stored as `''` (suppressing the Mongoose schema default).
- **`describe('login')`** — verifies correct-credential success; asserts that "no such account" and "wrong password" produce **identical** status, message, and errors (401); rejects a soft-deleted account (401); returns 422 (not 401) for a too-short or missing/malformed credential, identically for existing and unknown accounts.
- **`describe('validatePasswordChange')`** — pure-function tests: valid pair → `[]`, mismatch → non-empty, too-short → non-empty, empty/omitted input → non-empty.
- **`describe('passwordChange')`** — verifies the new password is stored hashed (bcrypt prefix) and that login succeeds with the new value; also verifies a rejected pair leaves the stored password untouched.
- **`jest.mock('@infrastructure/observability/analytics', …)`** — replaces `emitAnalyticsEvent` with `jest.fn()` at module level.
- **`createLoginUser`** (local helper) — wraps `createUser` fixture with sensible defaults for login tests.

## Relationships

- **`src/modules/account/services/index.ts`** — the SUT; `accountService.signup`, `.login`, `.validatePasswordChange`, `.passwordChange` are exercised directly.
- **`src/modules/users/index.ts`** — re-exported `userRepository` (used to read stored docs back), plus type imports `UserDocument`, `Token`, `TokenType`.
- **`src/modules/users/repository.ts`** — implementation behind `userRepository.findOne` / `findOneWithCredentials` calls.
- **`src/modules/users/tests/fixtures.ts`** — `createUser` builds a seeded user document for each test.
- **`src/modules/account/analytics.ts`** — `accountAnalyticsEvents` is imported (available for future analytics-assertion tests).
- **`src/infrastructure/observability/analytics/index.ts`** — the analytics port; its `emitAnalyticsEvent` is mocked out for the duration of the suite.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the in-memory / test database before any test runs.
- **`tests/support/caller-context.ts`** — `testCallerContext` supplies the request-context argument required by service methods.
- **`tests/support/response.ts`** — `asSuccess` / `asReject` unwrap the service's discriminated-union result so assertions read naturally.
- **`tests/support/ports.ts`** — provides `observePort`; also documents the `jest.mock`-replacement pattern used here in place of `jest.spyOn`.

## Notes

- **Analytics mock uses `jest.mock`, not `jest.spyOn`.** The CommonJS namespace import exposes a non-configurable getter, so `spyOn` cannot redefine it. The `jest.mock` factory spreads `requireActual` and overrides only `emitAnalyticsEvent`.
- **Indistinguishable-failure test compares the two rejections to *each other*** (`wrongPassword.errors toEqual unknownAccount.errors`), not to a hard-coded literal. This keeps the test valid if the team deliberately changes the 401 message or status later, while still failing the moment the two arms diverge.
- **Password-hash assertion checks the bcrypt prefix** (`$2[aby]$`), not merely "is not equal to the input." This catches a regression where someone replaces bcrypt with a plain `String()` wrapper or another algorithm.
- **409 vs 422 distinction on signup** is intentional: 409 signals a state conflict (email already registered) so the UI can show "email taken," while 422 signals a field-level validation failure. The test pins the status code as a contract.
- **`imageUrl` empty-string test** exists because the Mongoose schema carries a `default` (a stock avatar URL). The service coalesces `undefined → ''` to suppress that default; without this test, removing the coalescing would silently make every new user appear to have a deliberate avatar.
