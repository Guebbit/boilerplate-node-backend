---
source: src/modules/account/tests/integration/auth-races.test.ts
sha256: d6b30f61145dcbd0b1cf9c41107ff6da0ff4fd530a5b80013ba25247ea2ef083
generated_at: 2026-11-14T19:01:26.234023+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/auth-races.test.ts

## Purpose

Integration tests that fire N genuinely concurrent requests (via supertest + `raceN`) at account endpoints to verify invariants under race conditions. Rather than asserting which request "won", each test checks a property that must hold regardless of scheduling: exactly one account exists, every token row survives, every refresh exchange returns a working token. The file exists because these invariants cannot be proven by serial tests or docblock assertions alone.

## Key elements

- **`describe('R1 — concurrent signups for one address')`** — Four tests: exactly one account created; status split is one 201 + N-1 409s; the surviving account can log in; serial duplicate still gets a friendly 409 (index is a backstop, not a replacement for the check-then-insert path).
- **`describe('R4 — concurrent logins for one account')`** — Three tests: N concurrent logins produce N session rows (no clobbering write); each row has a distinct session hash; concurrent revocation (`DELETE /account/sessions`) leaves zero rows, not a partial survivor set.
- **`describe('two simultaneous OAuth signups for one identity')`** — N parallel OAuth callbacks for the same identity produce exactly one account; losers get a 302 to `provider_error` or `account_exists` (never a 500); a retry after the race succeeds with a session cookie.
- **`describe('R5 — concurrent refresh-token rotation, same cookie')`** — N simultaneous `POST /account/refresh` calls presenting the *same* cookie all return 200 with distinct new refresh tokens; no racer is rejected as "theft".
- **`issueSession()`** (local helper) — Creates a user, logs in, extracts the `__Host-session` cookie value.
- **`startAttempt()`** (local helper) — Begins an OAuth flow against the fake provider and returns a closure for the callback hop, so callbacks can overlap independently.

## Relationships

- **`tests/support/race.ts`** — Supplies `raceN`, `RACE_SIZE`, `countStatus`, `expectNoServerErrors`. `raceN` is the concurrency primitive every test in this file uses to fire N requests simultaneously.
- **`tests/support/http.ts`** — Provides `api()`, the mounted-app supertest client used for every request.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module load to guarantee a clean database before any `describe` block runs.
- **`tests/support/cookies.ts`** — `cookieHeader` and `setCookie` are used to construct/parse `Set-Cookie` values for OAuth state and session assertions.
- **`tests/support/rate-limit-harness.ts`** — `withReloadedRateLimits` is imported (available for tests that need to reset rate-limit counters between runs).
- **`src/modules/account/services/index.ts`** — `accountService` is imported for service-level assertions where the test needs to inspect internal state beyond HTTP.
- **`src/modules/account/oauth/providers/index.ts`** — `registerOAuthProvider('fake', …)` wires the fake provider into the app before the OAuth race tests run.
- **`scenarios/support/doubles/oauth-fake.ts`** — `fakeOAuthProvider` is the provider implementation registered in `beforeAll` for the OAuth race test.
- **`src/modules/account/tests/factories.ts`** — `sessionHashesOf`, `sessionRowsOf`, `tokenTypesOf`, `plantToken` give direct database access to verify row counts and token distinctness.
- **`src/modules/users/tests/factories.ts`** — `createUser`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD`, `userRepository` provide user creation and the repository used for count assertions.
- **`src/modules/users/repository.ts`** — Reached indirectly through `userRepository` from the users factories; the `count({ email })` call is the core invariant check in R1 and the OAuth test.
- **`tests/support/callers.ts`** — `testCallerContext` is imported for caller-context setup on requests.

## Notes

- **Two guards are load-bearing in R1.** `unique: true` on `users_email` *and* the E11000→409 branch in `databaseErrorInterpreter` are both required: the index alone turns the duplicate into a 500; the friendly-check alone lets two concurrent inserts both succeed. Removing either makes one of the R1 tests red.
- **R5 is a proof-of-design, not a bug guard.** The grace window (`NODE_TOKEN_ROTATION_GRACE_MS`) in `account/repository.ts` `supersede` is an intentional policy; these tests lock in that policy under real concurrency.
- **A green race test that never actually races is meaningless.** The file's docstring records observed hit rates (20/20 runs see ≥1 409 for signup; 20/20 see token loss with the old array-based sessions). If a run never contends, the test passes vacuously.
- **`--runInBand` does not serialise the concurrency inside a test.** The N requests in a single test are genuinely parallel; Jest's parallelism model is irrelevant here.
- **429 is explicitly asserted against** (`expectNoServerErrors`) so a rate-limit harness misconfiguration doesn't mask a real failure as a "pass".
- The OAuth race test uses `Promise.all` to *initiate* callbacks (all start-hops complete first) and then `raceN` to fire the actual callback requests concurrently, ensuring the contention window is real.
