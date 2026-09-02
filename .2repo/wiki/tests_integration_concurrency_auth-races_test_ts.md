# tests/integration/concurrency/auth-races.test.ts

## Purpose

Integration tests that fire N genuinely concurrent HTTP requests (via supertest) at the account endpoints and assert **invariants** (exactly one account, N distinct tokens, one superseded ancestor) rather than orderings. They cover three concurrency scenarios — duplicate signup (R1), token-array clobbering on concurrent login/logout-all (R4), and refresh-token rotation under simultaneous exchange (R5) — plus a one-time-token race. R1 and R4 were real bugs; R5 proves a deliberate grace-window design in `tokenSupersede`.

## Key elements

- **`describe('R1 — concurrent signups for one address')`** — Fires `RACE_SIZE` parallel `POST /account/signup` calls with the same email. Asserts exactly 1 × 201 + N-1 × 409, exactly one document in the collection, the surviving account can log in, and the serial duplicate path still returns 409.
- **`describe('R4 — concurrent logins for one account')`** — Fires parallel `POST /account/login` and `POST /account/logout-all` calls. Asserts all N tokens survive (no clobber), tokens are distinct values, and `$pull` removes every refresh token under contention.
- **`describe('R5 — concurrent refresh-token rotation, same cookie')`** — Fires parallel `GET /account/refresh` with the same JWT cookie. Asserts all racers get 200, each receives a **distinct** new refresh token, and exactly one ancestor is marked superseded.
- **`describe('one-time tokens under contention')`** — Fires 2 parallel `POST /account/reset-confirm` with the same one-time token; asserts exactly one succeeds and the token is spent.
- **`issueSession()`** — Local helper that creates a user, logs in, and returns the user plus the `jwt=` cookie value for rotation tests.
- **`setupTestDb()`** — Called at module top-level to reset the test database before all suites run.

## Relationships

- **`tests/support/race.ts`** — Provides `raceN` (fires N async callbacks in parallel via `Promise.allSettled`), `RACE_SIZE` (10), `countStatus`, and `expectNoServerErrors`. This file's entire concurrency mechanic depends on this helper.
- **`tests/support/http.ts`** — Provides the `api()` supertest agent used for every HTTP call in the file.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` seeds and clears the test database; called once at the top of the module.
- **`src/modules/users/tests/fixtures.ts`** — `createUser` (creates a user with a token) and `PLAIN_PASSWORD` are used throughout to set up pre-authenticated accounts.
- **`src/modules/users/index.ts`** — Barrel export consumed for `userRepository`, `hashToken`, and `TokenType`.
- **`src/modules/users/model.ts`** — `userModel` (the Mongoose model) is imported **directly** from this file rather than via the barrel, to call `countDocuments` and inspect the raw token array. The barrel intentionally omits it for runtime code.
- **`src/modules/users/repository.ts`** — `userRepository.findOneWithCredentials` is the read path used to inspect stored tokens after each race.

## Notes

- `userModel` is imported from `@modules/users/model` directly, **not** from the barrel. The file's comment states this is permitted for specs but forbidden for runtime code.
- Tests assert invariants (counts, set-size of distinct tokens, superseded count) and deliberately do **not** assert which request "won." The docblock records that which participant wins is non-deterministic and varies per run.
- The docblock records observed hit rates (N=10, 20 runs, 2026-08-08) to document that the races were actually contended — a race test that never races is considered vacuous.
- 429 responses are explicitly asserted against (via `expectNoServerErrors`), because the test harness's rate limiter could otherwise mask a real failure as a throttle.
- `raceN` uses `Promise.allSettled`, not `Promise.all`, so one rejection does not short-circuit the other N-1 in-flight requests.
