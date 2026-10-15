---
source: tests/integration/concurrency/auth-races.test.ts
sha256: 28d938d850f303bc6c068fbe868cd89d72fc72ef1acf4e1c20c1ae71dbd19e74
generated_at: 2026-10-15T12:44:55.676927+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/concurrency/auth-races.test.ts

## Purpose

Integration tests that fire N genuinely concurrent requests (via supertest) at the mounted account app and assert **invariants** — "exactly one user exists", "N session rows exist", "all racers get a working token" — rather than orderings. It guards specific check-then-act and read-modify-write races (R1, R4, R5) and proves the refresh-token rotation grace-window design under real parallelism.

## Key elements

- **`setupTestDb()`** (called at module top-level) — ensures a clean, isolated database for the whole suite.
- **`describe('R1 — concurrent signups for one address')`** — four tests: exactly one document in `users`; the status split is 1×201 + (N−1)×409; the surviving account can log in; the serial (non-racy) duplicate path still returns 409.
- **`describe('R4 — concurrent logins for one account')`** — three tests: all N login responses are 200 and N session rows exist; the N session hashes are distinct; concurrent `logout-all` removes **every** row.
- **`describe('two simultaneous OAuth signups for one identity')`** — one test using a registered `fake` OAuth provider: N simultaneous callbacks yield one account; losers get a 302 with `error=provider_error`; a subsequent retry signs in successfully.
- **`describe('R5 — concurrent refresh-token rotation, same cookie')`** — tests that N simultaneous `/account/refresh` calls all return 200 and each mints a **distinct** rotated cookie (truncated in source).
- **`issueSession()`** (local helper) — creates a user, performs one login, extracts the `__Host-session` cookie.
- **`startAttempt()`** (local helper) — issues an OAuth start request, then returns a closure that fires the callback with the state/verifier cookies, so multiple callbacks can overlap.
- **`RACE_SIZE`** — the concurrency count (from `tests/support/race.ts`); the file's header documents 20/20-run hit rates at N=10.

## Relationships

- **`tests/support/race.ts`** — supplies `raceN`, `RACE_SIZE`, `countStatus`, `expectNoServerErrors`; the `raceN` wrapper is the sole mechanism for issuing concurrent requests.
- **`tests/support/http.ts`** — supplies `api()`, the supertest-backed request builder used for every HTTP call.
- **`tests/support/callers.ts`** — supplies `testCallerContext` (imported; likely used in truncated portion for caller-scoped assertions).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` resets the database before the suite runs.
- **`tests/support/rate-limit-harness.ts`** — `withReloadedRateLimits` (imported; likely wraps tests that would otherwise trip 429s during N rapid requests).
- **`src/modules/users/model.ts`** — `userModel.countDocuments` is used to assert the "exactly one document" invariant directly against the DB, bypassing the HTTP layer.
- **`src/modules/users/tests/factories.ts`** — `createUser`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD` seed test data.
- **`src/modules/account/tests/factories.ts`** — `sessionRowsOf`, `sessionHashesOf`, `tokenTypesOf`, `plantToken` inspect session/token state for assertions.
- **`src/modules/account/services/index.ts`** — `accountService` is imported (likely referenced in the truncated portion for service-level setup or teardown).

## Notes

- The file header explicitly records **empirical hit rates** (20/20 runs at N=10) to prove the races are actually contended; a test that never fires the race is considered measuring nothing.
- `userModel` is imported **directly** from `@modules/users/model`, not via the barrel. A comment in the import explains: specs may reach the model, runtime code may not.
- The R1 test comments make clear that **both** the `unique: true` index **and** the E11000→409 branch in `databaseErrorInterpreter` are necessary; either alone yields either multiple 201s or 500s.
- R5 is framed as proving a **design decision** (grace-window reissue via `supersede` in `account/repository.ts`), not merely closing a bug.
- The file is truncated in the provided source; the R5 section likely contains additional tests (e.g., the grace-window expiry case) not shown here.
