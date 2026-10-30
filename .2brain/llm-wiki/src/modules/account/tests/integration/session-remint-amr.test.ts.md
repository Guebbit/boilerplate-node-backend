---
source: src/modules/account/tests/integration/session-remint-amr.test.ts
sha256: 28e113dbc654438280ca85bfbd306600c933de88fd456e42ce73819ed0fac845
generated_at: 2026-10-29T03:01:47.728496+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/session-remint-amr.test.ts

## Purpose

Integration tests that verify the `amr` (authentication-method) claim written into the `__Host-session` cookie after every path that replaces a live session. The contract under test: a verified code adds `otp` to the prior claims, a password change resets to `pwd` alone, and a challenge token that names no proof is rejected without minting a session.

## Key elements

- **`sessionWith(userId, amr)`** – Mints a session directly through the token layer (`continueSession` → `createAccessToken`), bypassing any session guards, so tests can start from a known `amr` state.
- **`amrOfCookie(response)`** – Extracts the `__Host-session` cookie from a supertest response, decodes it with `jose.decodeJwt`, and returns its `amr` claim. Throws if the cookie is absent.
- **`armedAccount()`** – Creates a verified user, mints a `pwd`-only session, runs the TOTP setup + confirm flow, and calls `forgetSessionEpoch` so subsequent requests see the new epoch. Returns `{ user, secret }`.
- **`describe('the proofs a re-minted session claims')`** – Three tests: OTP confirm appends `otp`; 2FA-disable-with-code preserves `['pwd','otp']`; password change collapses to `['pwd']`.
- **`describe('a login challenge that names no proof')`** – One test: a `MFA_CHALLENGE_TOKEN_TYPE` token planted without an `amr` payload is rejected with 401 and produces no session cookie, even when the TOTP code is correct.

## Relationships

- **`src/modules/account/session/jwt.ts`** – Provides `createAccessToken` and `continueSession`, used by `sessionWith` to mint tokens at the token layer (the "re-mint" path the tests exercise).
- **`src/modules/account/token-types.ts`** – Supplies `MFA_CHALLENGE_TOKEN_TYPE`, the token kind planted in the no-proof challenge test.
- **`src/modules/account/tests/factories.ts`** – Provides `plantToken`, used to seed a challenge token into the DB without going through the normal login flow.
- **`src/modules/users/tests/factories.ts`** – Provides `createUser`, `PLAIN_PASSWORD`, and `REPLACEMENT_PASSWORD` for user fixtures and password-change payloads.
- **`tests/support/http.ts`** – Provides the `api` supertest helper for all HTTP requests.
- **`tests/support/cookies.ts`** – Provides `setCookie` to pull a named cookie out of a response.
- **`tests/support/session-epoch.ts`** – Provides `forgetSessionEpoch` to clear the server-side epoch cache after TOTP setup.
- **`tests/support/setup-test-db.ts`** – Provides `setupTestDb`, called once at module level to initialise the test database.
- **`tests/support/totp.ts`** – Provides `codeFor` to generate valid TOTP codes from a secret at a given time step.

## Notes

- `sessionWith` intentionally calls `continueSession` + `createAccessToken` directly so no session-guard logic (e.g., epoch checks, revocation) intervenes; this isolates the `amr` claim behaviour under test.
- `forgetSessionEpoch` must be called after TOTP setup (as `armedAccount` does) or subsequent requests may be rejected against a stale epoch.
- The "no proof" challenge test asserts both a 401 status **and** the absence of a session cookie — guarding against the server minting a session as a side-effect of a failed auth attempt.
