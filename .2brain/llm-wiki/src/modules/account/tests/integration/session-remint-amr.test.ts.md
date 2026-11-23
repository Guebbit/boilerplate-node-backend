---
source: src/modules/account/tests/integration/session-remint-amr.test.ts
source_sha256: 9e953e91352504efc1413146105b6fa89b19e26954f03374a3f4f3799fbb8640
context_sha256: 10c7ef34f8c9afd7b939db2f43c7d8668ef39aff5a47ba2a0ccdbc6c825935cd
generated_at: 2026-11-22T04:02:12.373003+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/session-remint-amr.test.ts

## Purpose
Integration tests that pin down the `amr` (authentication methods references) claim on the session cookie handed back by each path that replaces a live session. A verified second-factor code adds `otp` to what the caller already held, a password change claims `['pwd']` alone, and nothing is defaulted. A login challenge that names no proof is refused.

## Key elements
- `sessionWith(userId, amr)`: mints a session straight from the token layer (`continueSession` then `createAccessToken`) and returns a `Bearer` header value plus a `__Host-session=` cookie string. This is a re-mint, so no guard applies.
- `amrOfCookie(response)`: reads the `__Host-session` Set-Cookie from a supertest response, decodes the JWT with `jose`'s `decodeJwt`, and returns its `amr`. Throws if no session cookie is set.
- `armedAccount()`: creates a verified user, sets up and confirms TOTP via the API, calls `forgetSessionEpoch`, and returns `{ user, secret }`.
- Test group "the proofs a re-minted session claims":
  - `POST /account/2fa/methods/totp/confirm` yields `['pwd', 'otp']`.
  - `POST /account/2fa/disable` with a code yields `['pwd', 'otp']`.
  - `POST /account/password` yields status 200 and `['pwd']`, even when the old session proved `['pwd', 'otp']`.
- Test group "a login challenge that names no proof": `POST /account/login/2fa` with a planted MFA challenge token that has no `amr` and a valid code returns 401 and sets no session cookie.

## Relationships
- `src/modules/account/session/jwt.ts`: supplies `continueSession` and `createAccessToken`, used to mint test sessions directly.
- `src/modules/account/token-types.ts`: supplies `MFA_CHALLENGE_TOKEN_TYPE` for the planted challenge.
- `src/modules/account/tests/factories.ts`: `plantToken` inserts the challenge token into the database.
- `src/modules/users/tests/factories.ts`: `createUser`, `PLAIN_PASSWORD` and `REPLACEMENT_PASSWORD`.
- `tests/support/http.ts` (`api`), `tests/support/cookies.ts` (`setCookie`), `tests/support/totp.ts` (`codeFor`), `tests/support/session-epoch.ts` (`forgetSessionEpoch`) and `tests/support/setup-test-db.ts` (`setupTestDb`, called at module load) provide HTTP, cookie, code-generation, epoch-reset and database support.

## Notes
- `codeFor(secret, 0)` is used to confirm the factor and `codeFor(secret, 1)` for later actions. The second argument is not explained in this file, but the different values suggest each code is generated for a different step so none is reused.
- `forgetSessionEpoch(bearer)` is called after arming TOTP, presumably so the later re-minted session is not rejected as stale. The file does not say so explicitly.
