---
source: src/modules/account/tests/integration/auth-races.test.ts
sha256: 2c97cb0417d6e703c5577bc86c8a6637e3d3a4f982ec0ea0aff90457a548280d
generated_at: 2026-10-29T02:53:48.348342+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/auth-races.test.ts

## Purpose
Integration tests that fire N genuinely concurrent requests against the mounted account app (via supertest) to verify concurrency invariants on signup, login/session, OAuth callback, and refresh-token-rotation endpoints. The suite asserts *properties* ("exactly one account exists", "all N tokens survive") rather than which request won, and documents the specific race each test guards (R1, R4, R5) along with the mechanism that closes it.

## Key elements
- **`R1 — concurrent signups for one address`** (describe block): Four tests firing `RACE_SIZE` parallel `POST /account/signup` requests for the same email. Verifies exactly one `201` / N−1 `409`, no 500s, surviving account is log-in-able, and the serial duplicate path still returns 409.
- **`R4 — concurrent logins for one account`** (describe block): Fires parallel `POST /account/login` calls, then checks `sessionRowsOf` count, token distinctness via `sessionHashesOf`, and that a concurrent `DELETE /account/sessions` under contention removes *all* rows.
- **`two simultaneous OAuth signups for one identity`** (describe block): Registers `fakeOAuthProvider`, builds N parallel OAuth callback requests via `startAttempt`, and asserts exactly one account is created while losers receive a 302 with `provider_error` or `account_exists` (never a 500). A follow-up retry must log in successfully.
- **`R5 — concurrent refresh-token rotation, same cookie`** (describe block): N parallel `POST /account/refresh` calls presenting the *same* session cookie. Asserts every racer gets a 200 with a distinct rotated refresh token (grace-period sibling reissue), not a 401 "theft" rejection.
- **`issueSession`** (local helper): Creates a user, logs in, and extracts the `__Host-session` cookie for reuse across R5 tests.
- **`startAttempt`** (local helper): Performs the OAuth "start" redirect and returns a thunk that issues the callback GET with the appropriate state/verifier cookies, so N callbacks can overlap.
- **Module-level `setupTestDb()`**: Resets the test database before the suite runs.

## Relationships
- **`tests/support/race.ts`** — provides `raceN`, `RACE_SIZE`, `countStatus`, `expectNoServerErrors`; the core concurrency primitive the whole file is built on.
- **`tests/support/http.ts`** — `api()` supertest helper used for every HTTP call.
- **`tests/support/cookies.ts`** — `cookieHeader` and `setCookie` for OAuth state cookies and session-cookie assertions.
- **`tests/support/callers.ts`** — `testCallerContext` imported for caller identity injection.
- **`tests/support/rate-limit-harness.ts`** — `withReloadedRateLimits` imported to reset rate-limit state between tests.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` for clean-database isolation.
- **`src/modules/users/tests/factories.ts`** — `createUser`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD`, `userRepository` (used for direct row counts and password constants).
- **`src/modules/users/repository.ts`** — the underlying repository whose `unique: true` index on `users_email` is the backstop R1 exercises.
- **`src/modules/account/services/index.ts`** — `accountService` imported (used in the truncated portion for service-level assertions or setup).
- **`src/modules/account/oauth/providers/index.ts`** — `registerOAuthProvider` to register the fake provider before the OAuth block.
- **`scenarios/support/doubles/oauth-fake.ts`** — `fakeOAuthProvider` double that drives the OAuth callback flow.
- **`src/modules/account/tests/factories.ts`** — `plantToken`, `sessionHashesOf`, `sessionRowsOf`, `tokenTypesOf` helpers for inspecting session/token state after races.

## Notes
- The file deliberately uses `Promise.allSettled` (via `raceN`) rather than `Promise.all` so one failure doesn't mask the others; see the header comment referencing `tests/support/race.ts` for the rationale.
- `--runInBand` (jest) does **not** serialize the N in-flight HTTP calls within a single test; the concurrency is real HTTP overlap, not worker parallelism.
- The R5 refresh-rotation test encodes a *design decision* (grace-period sibling reissue within `NODE_TOKEN_ROTATION_GRACE_MS`) rather than a bug fix — the test exists to prove that guarantee under true concurrency.
- `accountService` and `withReloadedRateLimits` are imported but not exercised in the visible portion; they likely appear in the truncated tail of the file.
- The file records empirical hit-rate data (20/20 runs seeing the race) in its header to justify that the tests actually contend rather than passing vacuously.
