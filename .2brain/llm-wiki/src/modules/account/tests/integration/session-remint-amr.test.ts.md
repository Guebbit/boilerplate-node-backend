---
source: src/modules/account/tests/integration/session-remint-amr.test.ts
sha256: 28e113dbc654438280ca85bfbd306600c933de88fd456e42ce73819ed0fac845
generated_at: 2026-11-08T04:43:41.574275+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/session-remint-amr.test.ts

## Purpose

Integration tests that assert the `amr` (Authentication Methods Reference) claim in the session cookie a response hands back whenever a live session is replaced. Each test pins down what the replacement session proves — e.g., confirming a TOTP code adds `otp`, changing the password resets to `pwd` alone — and one negative test confirms a challenge token that names no proof is refused without minting any session.

## Key elements

- **`sessionWith(userId, amr)`** – Mints a refresh + access token directly through the token layer (`continueSession` → `createAccessToken`) so the caller controls the `amr` without going through login guards. Returns a `bearer` header value and a `__Host-session` cookie string.
- **`amrOfCookie(response)`** – Reads the `__Host-session` cookie from a supertest `Response`, decodes the JWT, and returns its `amr` field. Throws if the cookie is absent.
- **`armedAccount()`** – Creates a verified user, arms a TOTP factor (setup + confirm), calls `forgetSessionEpoch` to clear any epoch guard, and returns `{ user, secret }` for code generation in subsequent steps.
- **`describe('the proofs a re-minted session claims')`** – Three tests covering: TOTP confirm adds `otp`; TOTP disable (with code) retains `otp`; password change resets amr to `['pwd']`.
- **`describe('a login challenge that names no proof')`** – Plants an `MFA_CHALLENGE_TOKEN_TYPE` token with a sentinel value, submits a correct code, and asserts 401 + no session cookie.

## Relationships

- **`src/modules/account/session/jwt.ts`** – `sessionWith` calls `continueSession` and `createAccessToken` to mint tokens at the token layer, bypassing HTTP-level guards.
- **`src/modules/account/token-types.ts`** – Supplies `MFA_CHALLENGE_TOKEN_TYPE` used by `plantToken` in the negative challenge test.
- **`src/modules/account/tests/factories.ts`** – Provides `plantToken` to insert a raw challenge token into the DB for the "no-proof" case.
- **`src/modules/users/tests/factories.ts`** – Provides `createUser`, `PLAIN_PASSWORD`, and `REPLACEMENT_PASSWORD` used throughout user setup and the password-change test.
- **`tests/support/http.ts`** – `api()` gives the supertest agent for all HTTP calls.
- **`tests/support/cookies.ts`** – `setCookie` extracts a named cookie from a response.
- **`tests/support/session-epoch.ts`** – `forgetSessionEpoch` clears the per-user epoch so subsequent requests aren't rejected by a stale-epoch guard.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` runs once at module load to prepare the test database.
- **`tests/support/totp.ts`** – `codeFor(secret, step)` generates a TOTP code at a given counter offset.

## Notes

- Sessions are minted through the token layer (`continueSession`/`createAccessToken`) rather than the login endpoint, intentionally bypassing guard logic so the test isolates the `amr`-claiming behavior of each account endpoint.
- `forgetSessionEpoch` is called inside `armedAccount` after confirming TOTP; without it, the epoch guard would reject the next request in the same test.
- The TOTP codes use explicit counter steps (`codeFor(secret, 0)` vs `codeFor(secret, 1)`) to avoid reusing a code within the same TOTP window.
- The cookie name is hardcoded as `__Host-session`; `amrOfCookie` manually strips the prefix before decoding, so it is coupled to that exact cookie name.
