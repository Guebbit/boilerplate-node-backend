# tests/integration/concurrency/auth-races.test.ts

## Purpose

Integration test suite that fires N genuinely concurrent HTTP requests (via supertest) at the account endpoints to verify concurrency invariants—exactly one account per email, all N login tokens survive, one-time tokens are spent once—rather than asserting which request "won." It guards two previously-real race bugs (R1: duplicate signup via non-unique index; R4: token array clobbered by read-modify-write) and confirms the rate limiter remains active.

## Key elements

- **`describe('R1 — concurrent signups for one address')`** — N concurrent `POST /account/signup` calls; asserts exactly 1 account, 1×201 + (N−1)×409, surviving account can log in, and the serial duplicate path still returns 409.
- **`describe('R4 — concurrent logins for one account')`** — N concurrent `POST /account/login`; asserts all N tokens are stored, they are distinct values, and `logout-all` removes every refresh token under contention.
- **`describe('one-time tokens under contention')`** — Two concurrent `POST /account/reset-confirm` with the same token; asserts exactly one 200 and the token is gone.
- **`describe('the limiter is raised for these suites, not disabled')`** — Temporarily sets `NODE_AUTH_RATE_LIMIT_MAX=3`, rebuilds the app via dynamic imports, and asserts 429s still occur.
- **`setupTestDb()`** — called once at module level to provision a fresh test database.

## Relationships

- **`tests/support/race.ts`** — provides `raceN` (fire N requests via `Promise.allSettled`), `countStatus`, `expectNoServerErrors`, and `RACE_SIZE`.
- **`tests/support/http.ts`** — provides `api()` returning a supertest agent wired to the mounted Express app.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises a clean MongoDB instance for the suite.
- **`src/modules/users/index.ts`** — barrel export; test imports `userRepository` and `TokenType` from here.
- **`src/modules/users/model.ts`** — `userModel` imported directly (bypassing the barrel) to call `countDocuments` for invariant checks.
- **`src/modules/users/repository.ts`** — `userRepository.findOneWithCredentials` used to inspect stored token arrays after races.
- **`src/modules/users/tests/factory.ts`** — `createUser` seeds a known user; `PLAIN_PASSWORD` is the shared test credential.

## Notes

- The test deliberately imports `userModel` from the model file rather than the barrel; the in-file comment states specs may reach the model but runtime code may not.
- Assertions are invariant-based ("exactly one account", "N distinct tokens"), never ordering-based. The header records observed hit rates (20/20 runs contended) to prove the tests actually race.
- The rate-limiter test uses `jest.resetModules()` + dynamic `import()` to rebuild the limiter with a small budget (3) so the 429 check is meaningful without exhausting the real (1000) budget.
- `expectNoServerErrors` is called on every race result set to catch 5xx responses that would mask a broken error-interpreting branch.
