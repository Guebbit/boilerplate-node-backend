---
source: src/modules/account/tests/integration/login-restore.test.ts
sha256: df59c68d2029cf5e43ac8cb5cf54a280d0f196f244e13287fa9d7a32d120c6e7
generated_at: 2026-10-29T02:56:57.520069+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/login-restore.test.ts

## Purpose

Integration tests for the login and account-restore flows during the deletion grace window. Verifies over HTTP that a valid sign-in on a pending account returns a claim check (no session), that `POST /account/login/restore` cancels the deletion and starts a session, that TOTP is required before the claim check is offered, and that the OAuth callback path surfaces the same claim-check cookie.

## Key elements

- **`daysFromNow(days)`** – returns a `Date` offset from the current time; negative values mean the past.
- **`pendingAccount(overrides?)`** – creates a verified user, then calls `userService.scheduleOwnDeletion` with an epoch 60 s in the past and a purge 20 d out, so the account is in grace.
- **`signIn(email, password?)`** – shorthand `POST /account/login` via the `api` helper.
- **`armTotp(email)`** – performs a full TOTP setup + confirm cycle and returns the secret for later `codeFor` calls.
- **`claimCheck(email?)`** – creates a pending account, signs in, and returns the `challenge` string from the response body.
- **`describe` blocks** cover:
  - `POST /account/login` on a pending account (claim-check shape, no session cookie, wrong-password parity, banned/past-purge → 401).
  - `POST /account/login/restore` (happy path, single-use enforcement, unknown/expired/missing challenge, grace-expired after sign-in).
  - Second-factor flow (TOTP asked first, then claim check offered; only MFA cookie cleared).
  - `GET /account/oauth/:provider/callback` for a pending account (302 with query params, `__Host-oauth_deletion_challenge` cookie, restore from that cookie).

## Relationships

- **`tests/support/http.ts`** – `api()` is the supertest-style HTTP client used for every request.
- **`tests/support/cookies.ts`** – `cookieHeader` extracts a specific cookie for the next request; `setCookie` asserts whether a response set a named cookie.
- **`tests/support/problem.ts`** – `withoutInstance` strips the `instance` field so error bodies can be compared without non-deterministic identifiers.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` (called at module top) resets the in-memory/test database before the suite runs.
- **`tests/support/totp.ts`** – `codeFor(secret, offset)` generates a valid TOTP code for a given secret and time step.
- **`src/modules/users/tests/factories.ts`** – `createUser` and `PLAIN_PASSWORD` build the fixture user; `userRepository` provides direct DB reads/updates for assertions.
- **`src/modules/users/index.ts`** – exports `userService` (specifically `scheduleOwnDeletion`) to put an account into the pending state.
- **`src/modules/users/repository.ts`** – `userRepository` used for `findById`, `findOne`, `updateMany`, and `linkOAuthAccount` assertions.
- **`src/modules/account/token-types.ts`** – `DELETION_RESTORE_TOKEN_TYPE` is the token type passed to `plantToken` when simulating an expired restore token.
- **`src/modules/account/tests/factories.ts`** – `plantToken` inserts a token row directly; `sessionRowsOf` reads session rows for assertions.
- **`src/modules/account/oauth/providers/index.ts`** – `registerOAuthProvider` is called in `beforeAll` to wire the fake provider.
- **`scenarios/support/doubles/oauth-fake.ts`** – `fakeOAuthProvider` supplies the OAuth flow implementation used by the callback test.

## Notes

- The OAuth test reads `__Host-oauth_state` and `__Host-oauth_verifier` from the initial redirect response and replays them as a `Cookie` header on the callback request — the OAuth state/verifier are cookie-scoped, not query-scoped, in this implementation.
- `withoutInstance` comparisons ensure that 401 bodies for different failure reasons (banned, past purge, wrong password) are structurally identical except for the `instance` discriminator; the tests assert that parity explicitly.
- The TOTP offset is `0` during arming (confirm) and `1` during the sign-in code submission, matching a 30-second-step TOTP where one step has elapsed between the two calls.
- `plantToken` is used to simulate an *expired* restore token (`ttlMs: -1000`) without waiting in real time.
