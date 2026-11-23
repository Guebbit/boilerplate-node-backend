---
source: src/modules/account/tests/integration/auth-races.test.ts
source_sha256: 24593ac180dca5fbb234de43ca87e28d57beb07ae3bb36cad12549a6904d90ea
context_sha256: 1c38cc584291b3c291a86ceda9de9712a7feb6db3bcc6d00968f5a7d9d106d2b
generated_at: 2026-11-22T03:52:56.346168+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/auth-races.test.ts

## Purpose
Integration test suite for concurrency on the account endpoints. It fires N requests that are genuinely in flight through the mounted app and asserts invariants (for example "exactly one user exists") rather than orderings ("the first one won"). The header ties each `describe` block to a numbered race: R1, R4 and R5. It also records that the tests do contend: measured at N=10 over 20 consecutive runs, signup saw a 409 in 20/20 runs.

## Key elements
- **R1 — concurrent signups for one address**: races `RACE_SIZE` `POST /account/signup` calls with the same email. Asserts:
  - exactly one user exists;
  - one 201 and `RACE_SIZE - 1` 409s, which needs both `unique: true` on `users_email` and the E11000 → 409 branch in `databaseErrorInterpreter`;
  - the surviving account can log in;
  - a serial duplicate signup still gets 409 from the pre-existing check-then-insert path.
- **R4 — concurrent logins for one account**: races logins and asserts:
  - `RACE_SIZE` session rows survive, so no token is lost to a clobbering write;
  - the token hashes are distinct;
  - racing `DELETE /account/sessions` calls leave zero session rows.
- **`issueSession()`**: helper that creates a user, logs in, and returns `{ user, jwtCookie }`, where `jwtCookie` is the `__Host-session=` Set-Cookie value.
- **`startAttempt()`**: helper that calls `GET /account/oauth/fake`, then returns a function that issues the callback request. It sends the `__Host-oauth_state` and `__Host-oauth_verifier` cookies. Starts and callbacks are built separately so the callbacks can overlap.
- **Simultaneous OAuth signups**: registers the fake provider in `beforeAll`. Races `RACE_SIZE` callbacks for one identity and asserts:
  - every response is a 302 that either sets a session cookie or redirects with `error=provider_error` or `error=account_exists`;
  - exactly one user exists for `oauth.demo@example.com`;
  - a retry signs in.
- **R5 — concurrent refresh-token rotation with the same cookie**: races `POST /account/refresh` with one cookie. Asserts:
  - every racer gets a 200;
  - every racer gets a distinct rotated `__Host-session` cookie;
  - the third test (its title says exactly one superseded ancestor is left behind) is cut off in the visible content. The header says `supersede` lets one exchange of a token win atomically, and that others within `NODE_TOKEN_ROTATION_GRACE_MS` are reissued a sibling token rather than rejected.

## Relationships
- `tests/support/race.ts`: provides `RACE_SIZE`, `raceN`, `countStatus` and `expectNoServerErrors`. The header points to it for the rationale behind the race helpers' design.
- `tests/support/http.ts` (`api`), `callers.ts` (`testCallerContext`), `cookies.ts` (`cookieHeader`, `setCookie`), `setup-test-db.ts` (`setupTestDb()`, called at module level) and `rate-limit-harness.ts` (`withReloadedRateLimits`) are shared test support. In the visible content, `api`, `cookieHeader`, `setCookie` and `setupTestDb` are used; `testCallerContext`, `withReloadedRateLimits` and `accountService` are imported but not used.
- `src/modules/users/tests/factories.ts`: provides `createUser`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD` and `userRepository`, which is used for `count({ email })`.
- `src/modules/account/tests/factories.ts`: provides `plantToken`, `sessionHashesOf`, `sessionRowsOf` and `tokenTypesOf`. The visible code uses the session helpers for row and hash assertions.
- `src/modules/account/oauth/providers/index.ts`: `registerOAuthProvider('fake', ...)` registers the test provider.
- `scenarios/support/doubles/oauth-fake.ts`: supplies `fakeOAuthProvider`.
- `src/modules/account/services/index.ts`: `accountService` is imported, but not used in the visible portion.
- `src/modules/users/repository.ts`: a neighbor, but not imported directly. `userRepository` comes via the users test factories.

## Notes
- Assertions deliberately check invariants and counts, never which request won.
- The `users_email` unique index alone would turn the duplicate into a 500. The E11000 → 409 mapping must be in place too.
- The R4 and R5 tests are written so a lost write or a copied token shows up as a count mismatch (for example N rows, N distinct tokens).
