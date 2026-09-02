# src/modules/account/tests/integration/service.test.ts

## Purpose

Integration test suite that pins the security invariants of the account service (signup, login, password change, bulk token removal). Tests are grouped by the invariant each defends rather than by function, so that a regression in a cross-cutting rule (indistinguishable login failures, soft-delete blocking, password-at-rest hashing) fails the build even when every happy-path test still passes.

## Key elements

- **`describe('signup')`** — verifies account creation, password hashing at rest (bcrypt `$2[aby]$` prefix), 422 on mismatched confirmation, 409 on duplicate email, and `imageUrl` coalescing to `''` to suppress the mongoose default.
- **`describe('login')`** — asserts unknown-account and wrong-password responses are *equal* (status, message, errors), soft-deleted accounts get 401, and a too-short password yields 422 regardless of account existence (no account-existence oracle via response shape).
- **`describe('validatePasswordChange')`** / **`describe('passwordChange')`** — pure-validation edge cases (empty input must produce errors) and the ordering guarantee that validation precedes the write (a rejected pair leaves the stored password untouched).
- **`jest.mock('@infrastructure/observability/analytics', …)`** — replaces the entire namespace so `emitAnalyticsEvent` becomes a `jest.fn()`. Required because `jest.spyOn` cannot redefine the non-configurable getter exposed by a CommonJS namespace import.
- **`setupTestDb()`** — called at module top-level to provision a clean test database before any `describe` block runs.
- **`VALID_PASSWORD`** — shared constant (`'Correct-Horse-Battery1'`) used across all test groups.

## Relationships

- **`src/modules/account/services/index.ts`** — the system under test; `accountService.signup`, `.login`, `.validatePasswordChange`, `.passwordChange` are exercised directly.
- **`src/modules/users/index.ts`** — re-exported `userRepository` is used to read back persisted documents (including `findOneWithCredentials`); `hashToken` and `TokenType` are imported for token-related assertions.
- **`src/modules/users/model.ts`** — `UserDocument` type parameterises fixture overrides (e.g. `deletedAt`).
- **`src/modules/users/repository.ts`** — `userRepository` queries used to verify at-rest state (hash format, `imageUrl` default suppression).
- **`src/modules/users/tests/fixtures.ts`** — `createUser` builds pre-seeded user documents for each test scenario.
- **`src/modules/account/analytics.ts`** — `accountAnalyticsEvents` imported to identify which events the service should emit.
- **`src/infrastructure/observability/analytics/index.ts`** — namespace-replaced via `jest.mock`; `emitAnalyticsEvent` is the only observable surface.
- **`tests/support/ports.ts`** — `observePort` helper; also documents *why* the analytics mock uses full-namespace replacement instead of `jest.spyOn`.
- **`tests/support/response.ts`** — `asSuccess` / `asReject` unwrap the service's union response type into a typed shape for assertions.
- **`tests/support/caller-context.ts`** — `testCallerContext` supplies the mandatory caller argument to every service call.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` initialises the test database connection and schema.

## Notes

- The login-indistinguishability test asserts the two failure responses are **equal to each other** (`toEqual` / `toBe`) rather than comparing each to a hard-coded literal. This keeps the test valid if the team later changes the status code or message uniformly, while still failing the moment the two arms diverge.
- Password hashing is verified by matching the bcrypt modular-crypt prefix (`^\$2[aby]\$`), not merely by "differs from input." This catches a regression to a different hash algorithm or a no-op hook.
- The analytics port is **replaced**, not spied on. `jest.spyOn` cannot work here because a CommonJS `import * as ns` exposes a non-configurable getter; see the comment in `tests/support/ports.ts` for the full rationale.
- `setupTestDb()` runs at module scope (not inside a `beforeAll`), so the database is ready before Jest's describe-collection phase completes.
