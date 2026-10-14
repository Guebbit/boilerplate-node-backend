---
source: src/modules/account/tests/integration/session-remint-amr.test.ts
sha256: 3dad530be959eee4708e03348802503476619ab75a65760a826e0e94f5cee2ae
generated_at: 2026-10-14T14:42:28.702855+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/session-remint-amr.test.ts

## Purpose

Integration tests that verify the `amr` (authentication methods reference) claim in the session cookie returned whenever a live session is replaced. The invariant under test: each replacement path states exactly what it proves — a verified code *adds* `otp`, a password change *claims only* `pwd` — and nothing is silently defaulted.

## Key elements

- **`sessionWith(userId, amr)`** — Mints a session straight from the token layer (`continueSession` → `createAccessToken`) with an explicit `amr` array. Bypasses HTTP guards so tests can control prior state precisely.
- **`amrOfCookie(response)`** — Extracts the `__Host-session` cookie from a supertest response, decodes the JWT, and returns its `amr` claim. Throws if no cookie is present.
- **`armedAccount()`** — Creates a verified user, arms a TOTP factor (setup + confirm), invalidates the session epoch, and returns the user and TOTP secret for later code generation.
- **`describe('the proofs a re-minted session claims')`** — Three cases: TOTP confirm appends `otp`; TOTP disable (with code) retains `otp`; password change resets `amr` to `['pwd']` regardless of prior claims.
- **`describe('a login challenge that names no proof')`** — A challenge token planted with no `amr` field is refused (401) even with a correct TOTP code, and no session cookie is minted.

## Relationships

- **`src/modules/account/session/jwt.ts`** — Imports `createAccessToken` and `continueSession` to mint sessions directly at the token layer (the "re-mint" the tests exercise).
- **`src/modules/account/token-types.ts`** — Imports `MFA_CHALLENGE_TOKEN_TYPE` used when planting the proof-less challenge token.
- **`src/modules/account/tests/factories.ts`** — Imports `plantToken` to write a token into the DB for the challenge test.
- **`src/modules/users/tests/factories.ts`** — Imports `createUser`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD` for user fixture and password-change payload.
- **`tests/support/http.ts`** — Imports `api` (supertest client) for all HTTP calls.
- **`tests/support/cookies.ts`** — Imports `setCookie` to read the `__Host-session` cookie from responses.
- **`tests/support/totp.ts`** — Imports `codeFor` to generate time-stepped TOTP codes.
- **`tests/support/session-epoch.ts`** — Imports `forgetSessionEpoch` to reset the epoch cache after arming a TOTP factor.
- **`tests/support/setup-test-db.ts`** — Imports `setupTestDb` for per-test database isolation.

## Notes

- The module-level docblock encodes the contract: **no path may default `amr`**. Each test asserts the *exact* array, making implicit additions or omissions visible as failures.
- `sessionWith` intentionally bypasses normal HTTP guards (it's a direct token-layer re-mint). This means the tests verify the *token/minting* logic, not the HTTP middleware that would normally produce the cookie.
- `forgetSessionEpoch` is called inside `armedAccount` after TOTP confirm; omitting it would cause the epoch guard to reject subsequent requests and obscure the `amr` assertion.
- The "challenge without amr" test plants the token via `plantToken` (DB-level) rather than through the API, isolating the server's validation of the challenge payload itself.
