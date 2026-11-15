---
source: src/modules/account/tests/integration/login-restore.test.ts
sha256: 558b2a9920b5b30fcdd750da509df5dd20548549ea50d62d2d58bdcc898b1975
generated_at: 2026-11-14T19:04:54.280305+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/login-restore.test.ts

## Purpose

Integration tests (over HTTP) for the login-restore flow that activates when a user signs in during their self-scheduled deletion grace period. Covers the claim-check response from `POST /account/login`, the `POST /account/login/restore` endpoint, the interaction with an armed second factor (TOTP), and the OAuth callback path — verifying that no session is issued until the restore is completed and that the account's deletion fields are cleared.

## Key elements

- **`pendingAccount(overrides?)`** — Creates a verified user via `createUser`, then calls `accountUserService.scheduleOwnDeletion` with a past `deletedAt` and a future `purgeAt`, returning the user.
- **`signIn(email, password?)`** — Thin wrapper around `POST /account/login`.
- **`armTotp(email)`** — Signs in, enrolls TOTP via `/account/2fa/methods/totp/setup`, confirms with a TOTP code, returns the secret.
- **`claimCheck(email?)`** — Signs in a pending account and returns the `challenge` string from the claim-check body.
- **`daysFromNow(days)`** — Date utility; negative values mean "days ago".
- **`describe('POST /account/login …')`** — Asserts claim-check shape, no `Set-Cookie`, empty session rows, wrong-password parity with non-pending accounts, and 401 for banned/expired-purge accounts.
- **`describe('POST /account/login/restore')`** — Asserts successful restore (token + cleared `deletedAt`/`purgeAt`), single-use challenge, 401 for unknown/expired/missing challenges, and 401 when `purgeAt` has passed after sign-in.
- **`describe('a pending account with a second factor')`** — Verifies the MFA code is requested first (`mfaRequired: true`), then the claim check appears in the 2FA response, then restore succeeds.
- **`describe('GET /account/oauth/:provider/callback …')`** — Walks the fake-OAuth redirect flow for a pending account; checks the 302 redirect params (`deletionPending=1`, `purgeAt`, `expiresAt`), the `__Host-oauth_deletion_challenge` cookie, and that restore via that cookie works.

## Relationships

- **`@tests/http`** (`api`), **`@tests/cookies`** (`cookieHeader`, `setCookie`), **`@tests/problem`** (`withoutInstance`) — HTTP/cookie/error-body utilities used throughout.
- **`@tests/setup-test-db`** (`setupTestDb`) — Initialises the in-memory test database before all tests.
- **`@tests/totp`** (`codeFor`) — Generates TOTP codes for the 2FA and `armTotp` helpers.
- **`@modules/users/tests/factories`** (`createUser`, `PLAIN_PASSWORD`, `userRepository`) — User creation and direct MongoDB access for state assertions and `purgeAt` manipulation.
- **`@modules/users/friends/account`** (`accountUserService`) — Called to schedule the deletion that puts the account in its grace period.
- **`../../token-types`** (`DELETION_RESTORE_TOKEN_TYPE`) — Used with `plantToken` to seed an expired restore token.
- **`../factories`** (`plantToken`, `sessionRowsOf`) — Account-module test helpers for token seeding and session-row inspection.
- **`../../oauth/providers`** (`registerOAuthProvider`) — Registers the fake provider in `beforeAll` so the OAuth callback route recognises it.
- **`@scenarios/support/doubles/oauth-fake`** (`fakeOAuthProvider`) — The concrete fake provider implementation used in the OAuth callback test.

## Notes

- `beforeAll` calls `registerOAuthProvider('fake', …)` globally; if this suite runs in parallel with other suites that also register a `'fake'` provider, they may collide.
- The "late-restore" test mutates `purgeAt` in the DB *after* the claim check is obtained, simulating the grace expiring between sign-in and restore — the restore must then reject.
- `withoutInstance` is used when comparing 401 error bodies to normalise out the `instance` (UUID) field that differs per request.
- The OAuth test manually extracts `__Host-oauth_state` and `__Host-oauth_verifier` from the first redirect's `Set-Cookie` and replays them on the callback request, mimicking browser cookie behaviour.
