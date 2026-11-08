---
source: src/modules/account/tests/integration/auth-races.test.ts
sha256: 2c97cb0417d6e703c5577bc86c8a6637e3d3a4f982ec0ea0aff90457a548280d
generated_at: 2026-11-08T04:34:25.783505+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/auth-races.test.ts

## Purpose

Integration test suite that fires genuinely concurrent HTTP requests (N in flight simultaneously) against the mounted account app and asserts **invariants** (e.g. "exactly one user row exists", "every issued token is distinct") rather than request orderings. It exists to prove that specific race conditions (R1, R4, R5) are closed and that a deliberate design decision—grace-period refresh-token rotation—holds under real concurrency, not just in a docblock.

## Key elements

- **`R1` describe** — N concurrent `POST /account/signup` for the same email. Asserts exactly one 201, N−1 409s, one surviving row, and that the survivor can still log in. Also verifies the serial duplicate path still returns 409.
- **`R4` describe** — N concurrent `POST /account/login`. Asserts all N get 200, N distinct session rows are created (no clobbered writes), all N hashes are unique, and concurrent `DELETE /account/sessions` under contention removes every row.
- **`issueSession()`** (local helper) — Creates a user, logs in, and returns the user plus the `__Host-session` cookie value for R5.
- **`startAttempt()`** (local helper) — Initiates a fake-OAuth flow and returns the callback request as a thunk so multiple callbacks can overlap.
- **OAuth describe** — N concurrent OAuth callback hits for one identity. Asserts exactly one account is created, each responder is either signed-in (302 + session cookie) or a known error redirect, and a retry successfully logs in.
- **`R5` describe** — N concurrent `POST /account/refresh` presenting the *same* cookie. Asserts all N receive 200 and each gets a distinct rotated refresh cookie (grace-period sibling issuance).
- **`setupTestDb()`** — Called at module top-level; resets the test database before the suite runs.
- **`beforeAll` in OAuth describe** — Registers `fakeOAuthProvider` under the `'fake'` key.

## Relationships

- **`tests/support/race.ts`** — Supplies `raceN`, `RACE_SIZE`, `countStatus`, and `expectNoServerErrors`; the concurrency engine for every test in this file.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` clears/reseeds the test database.
- **`tests/support/http.ts`** — `api()` factory for supertest requests against the mounted app.
- **`tests/support/callers.ts`** — `testCallerContext` for request-context setup.
- **`tests/support/cookies.ts`** — `cookieHeader` and `setCookie` helpers for reading/manipulating cookie headers in responses.
- **`tests/support/rate-limit-harness.ts`** — `withReloadedRateLimits` guards against 429 responses interfering with race assertions.
- **`src/modules/users/tests/factories.ts`** — `createUser`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD`, `userRepository` (used for post-race count/hash queries).
- **`src/modules/users/repository.ts`** — Underlying Mongo repository that the unique `users_email` index and E11000 error path depend on.
- **`src/modules/account/services/index.ts`** — `accountService` (imported; the service layer exercised by the HTTP endpoints).
- **`src/modules/account/oauth/providers/index.ts`** — `registerOAuthProvider` to inject the fake provider for the OAuth race test.
- **`scenarios/support/doubles/oauth-fake.ts`** — `fakeOAuthProvider`, the deterministic double used by the simultaneous-signup test.
- **`src/modules/account/tests/factories.ts`** — `plantToken`, `sessionHashesOf`, `sessionRowsOf`, `tokenTypesOf` helpers for inspecting session/token state after a race.

## Notes

- **Invariants over orderings:** No test asserts *which* request won. Which participant "wins" is non-deterministic (Mongod's business); the guarantee is the count/state after all N settle.
- **Two independent guards for R1:** The `unique: true` index *and* the E11000→409 branch in `databaseErrorInterpreter` are each necessary. The index alone turns the duplicate into a 500; the interpreter alone (without the index) lets both inserts succeed.
- **R5 is a design proof, not a bug fix:** It verifies the `NODE_TOKEN_ROTATION_GRACE_MS` grace-window behavior in `supersede` under real concurrency.
- **Contended-every-run evidence:** The docblock records that at N=10, 20/20 runs produced at least one 409 (R1) and the read-modify-write pattern lost tokens in 20/20 runs—confirming the tests actually exercise the race rather than passing vacuously.
- **`--runInBand` is irrelevant here:** Concurrency is achieved via `Promise.allSettled` within a single test, not via Jest's parallel workers.
- **429 is explicitly asserted against** via `expectNoServerErrors`, so rate-limiting can never mask a pass.
