# tests/integration/concurrency/auth-races.test.ts

## Purpose

Integration tests that fire genuinely concurrent requests (via `raceN`) against the mounted Express app and assert **invariants** (exactly one account, all tokens retained, one-time token consumed once) rather than orderings. They exist to lock in fixes for two real race-condition bugs — R1 (check-then-insert on a non-unique index) and R4 (read-modify-write on the token array) — and to prevent regression.

## Key elements

- **`describe('R1 — concurrent signups for one address')`** — Four tests: exactly one document created, status split is 1×201 + (N−1)×409, surviving account can still log in, and the serial duplicate path still returns 409.
- **`describe('R4 — concurrent logins for one account')`** — Three tests: all N tokens survive (no clobbering), all N token values are distinct, and `logout-all` under contention removes every refresh token.
- **`describe('one-time tokens under contention')`** — Verifies a password-reset token is consumed by exactly one of two simultaneous `reset-confirm` calls and is then absent from the document.
- **`describe('the limiter is raised for these suites, not disabled')`** — Rebuilds a minimal Express app with `credentialLimiters` and a small budget (3), then asserts 429s appear, proving the rate limiter is still active rather than silently disabled.
- **`setupTestDb()`** — called at module top-level to reset the test database before any suite runs.

## Relationships

- **`tests/support/race.ts`** — supplies `raceN`, `RACE_SIZE`, `countStatus`, and `expectNoServerErrors`; the concurrency harness and assertion helpers for every test in this file.
- **`tests/support/http.ts`** — provides `api()`, the supertest wrapper used for all account-endpoint calls.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` clears/seeds the test DB before the suite.
- **`src/modules/users/index.ts`** — barrel export for `userRepository` and `TokenType`.
- **`src/modules/users/model.ts`** — `userModel` imported **directly** (bypassing the barrel) to call `countDocuments`; the file's comment marks this as a spec-file-only exception.
- **`src/modules/users/repository.ts`** — `userRepository.findOneWithCredentials` is the read path used to inspect stored tokens after each race.
- **`src/modules/users/tests/fixtures.ts`** — `createUser` and `PLAIN_PASSWORD` seed the user for the login/token/reset suites.

## Notes

- Assertions target **invariants**, never "which request won." The header comment explicitly states this principle and records observed hit rates (N=10, 20 runs) so a test that never actually contends is flagged as vacuous.
- `userModel` is imported from `@modules/users/model` rather than the barrel; the inline comment notes this is allowed for tests but forbidden in runtime code.
- The rate-limiter test uses `jest.resetModules()` + dynamic `import()` to re-read `NODE_AUTH_RATE_LIMIT_MAX` after mutating the env var — the rest of the module tree already cached the value.
- The two bugs (R1, R4) are described in the file header with their fix strategy; the tests are the regression gate for those fixes and were landed in the same change.
