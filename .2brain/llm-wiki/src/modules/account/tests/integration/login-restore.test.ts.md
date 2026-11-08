---
source: src/modules/account/tests/integration/login-restore.test.ts
sha256: df59c68d2029cf5e43ac8cb5cf54a280d0f196f244e13287fa9d7a32d120c6e7
generated_at: 2026-11-08T04:38:08.975474+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/login-restore.test.ts

## Purpose

Integration tests for the account deletion-grace login flow over HTTP. Verifies that a valid sign-in during the grace window returns a claim-check payload (no session cookie), that `POST /account/login/restore` cancels the deletion and issues a session, and that the same flow composes correctly with TOTP second-factor and OAuth callback paths.

## Key elements

- **`pendingAccount(overrides?)`** – Creates a verified user via the users test factory, then calls `userService.scheduleOwnDeletion` with `deletedAt` one minute ago and `purgeAt` 20 days out. Returns the user row.
- **`signIn(email, password?)`** – Thin wrapper around `POST /account/login`.
- **`armTotp(email)`** – Signs in, enrolls TOTP (`/account/2fa/methods/totp/setup`), confirms with `codeFor(secret, 0)`, returns the secret.
- **`claimCheck(email?)`** – Signs in a pending account and extracts the `challenge` string from the response body.
- **`daysFromNow(days)`** – Small date-offset helper (negative = past).
- **`describe('POST /account/login …')`** – Asserts 200 + `deletionPending` payload, no `Set-Cookie`, no session row, account stays locked; 401 parity for wrong password; 401 for banned or post-purge accounts.
- **`describe('POST /account/login/restore')`** – Asserts restore succeeds (200 + token, `deletedAt`/`purgeAt` cleared); challenge is single-use; unknown/expired/missing challenges all yield 401; late restore (purge already passed) yields 401 and leaves the account locked.
- **`describe('a pending account with a second factor')`** – TOTP-gated flow: first response carries `mfaRequired`, second (after `/account/login/2fa`) carries `deletionPending`, restore then succeeds.
- **`describe('GET /account/oauth/:provider/callback …')`** – Registers `fakeOAuthProvider` in `beforeAll`, links an OAuth identity, walks the redirect + callback, asserts 302 with `deletionPending=1` query params, the challenge is stored in a `__Host-oauth_deletion_challenge` cookie, and restore-from-cookie works.

## Relationships

- **`tests/support/http.ts`** – `api()` provides the Supertest-based HTTP client used by every request.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initialises an in-memory Mongo for the suite.
- **`tests/support/cookies.ts`** – `setCookie` (assertion helper) and `cookieHeader` (builds a `Cookie` header value) are used to inspect/set cookies.
- **`tests/support/totp.ts`** – `codeFor(secret, window)` generates valid TOTP codes for the given 30 s window.
- **`tests/support/problem.ts`** – `withoutInstance` strips the `instance` field so error bodies can be compared shape-wise.
- **`src/modules/users/tests/factories.ts`** – `createUser`, `PLAIN_PASSWORD`, `userRepository` supply user fixtures and direct DB access.
- **`src/modules/users/index.ts`** – `userService.scheduleOwnDeletion` drives the deletion state under test.
- **`src/modules/account/token-types.ts`** – `DELETION_RESTORE_TOKEN_TYPE` names the token type planted for the expired-challenge test.
- **`src/modules/account/tests/factories.ts`** – `plantToken` (inserts an arbitrary token row) and `sessionRowsOf` (reads session documents).
- **`src/modules/account/oauth/providers/index.ts`** – `registerOAuthProvider` is called in `beforeAll` to make the fake available.
- **`scenarios/support/doubles/oauth-fake.ts`** – `fakeOAuthProvider` is the double registered as `'fake'` for the OAuth callback test.

## Notes

- `setupTestDb()` is called at module top level (not in `beforeAll`), so the DB is ready before any describe block executes.
- The TOTP test deliberately uses **window 0** for confirmation and **window 1** for the login attempt, ensuring the two codes fall in different 30-second buckets and the server's rate-limit/lockout logic isn't triggered by a repeated code.
- The OAuth test reads the redirect `Location` from the initial `/account/oauth/fake` GET and replays its query string on the callback request; the `__Host-oauth_state` and `__Host-oauth_verifier` cookies are forwarded manually via `cookieHeader`.
- `pendingAccount` hard-codes the email `pending@example.com` unless overridden; tests that need a distinct identity pass `{ email: … }`.
