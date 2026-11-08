---
source: src/modules/account/tests/integration/step-up-otp.test.ts
sha256: ca9cc130b881e8c78fafa57e17d3acb757c0431884f23325b43f447bbfe42e64
generated_at: 2026-11-08T04:44:20.780008+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/step-up-otp.test.ts

## Purpose

Integration tests covering the step-up (second-factor) authentication flow on account identity routes: verifying that email-change, password-change, and deletion endpoints require an `otp` proof when 2FA is armed, that re-authentication earns only the claims it proved, and that an email change can be undone from the old address's link. Also confirms that accounts without 2FA are unaffected.

## Key elements

- **`mockOutbox`** — Array capturing every queued email (recipient, template, data) via a `jest.mock` of the mailer adapter's `enqueueEmail`.
- **`sessionWith(userId, amr)`** — Mints a re-minted session (refresh + access token) carrying the given `amr` claims, returning `bearer` and `cookie` headers. Used to simulate pre-existing sessions with varying proof levels.
- **`armedAccount(email?)`** — Creates a verified user, logs in, sets up and confirms TOTP 2FA, then calls `forgetSessionEpoch`. Returns the user and the backup codes.
- **`tokenOfLastMail(template)`** — Scans `mockOutbox` for the most recent email of a given template and extracts the token from its `linkUrl`.
- **`requestChange(bearer, email?)`** — `PATCH /account` with a new email.
- **`undo(token)`** — `POST /account/email-change/undo` to spend an undo token.
- **`requested()`** — Sets up a full email-change scenario (create user → request change) and returns both the undo token and the confirm token from the mocked outbox.
- **Three `describe` blocks** — (1) identity routes gated by OTP, (2) `POST /account/reauth` with OTP (including wrong-code 422, locked 429, and no-attempt-spend on wrong password), (3) undoing an email change (restores old email, bumps `tokensValidAfter`, cancels pending confirmation).

## Relationships

- **`src/modules/account/session/jwt.ts`** — Imports `createAccessToken` and `continueSession` to mint sessions with specific `amr` claims without going through the login endpoint.
- **`src/modules/users/tests/factories.ts`** — Imports `createUser`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD` for user setup and password payloads.
- **`src/modules/users/repository.ts`** — Imports `userRepository` to assert on stored state (email, `mfaFailures`, `mfaLockedUntil`, `tokensValidAfter`, `pendingEmail`) and to directly update lock fields for the 429 test.
- **`tests/support/http.ts`** — Imports `api` as the supertest-style HTTP client for all route calls.
- **`tests/support/setup-test-db.ts`** — Imports `setupTestDb` (called once at module scope) to provision/tear down the test database.
- **`tests/support/environment.ts`** — Imports `setEnvironment` to set `NODE_MAIL_TRANSPORT: 'outbox'` so the mailer mock is active.
- **`tests/support/totp.ts`** — Imports `codeFor` to generate a valid TOTP code during the 2FA confirmation step in `armedAccount`.
- **`tests/support/session-epoch.ts`** — Imports `forgetSessionEpoch` to clear the session-epoch cache after TOTP setup so subsequent assertions aren't affected.
- **`src/modules/account/tests/factories.ts`** — Imports `plantToken`, `removeTokensOfKind` (used in the truncated portion, likely for token-state setup in the undo/confirmation tests).

## Notes

- `sessionWith` deliberately creates a **re-mint** (not a first session) to stand in for a session that existed *before* 2FA was armed; a first-session mint would be refused by the server.
- `armedAccount` calls `forgetSessionEpoch` after TOTP confirmation to reset the session-epoch tracker, preventing stale epoch state from leaking into subsequent assertions.
- The mailer mock is applied via `jest.mock` at module scope; `mockOutbox` is cleared in `beforeEach` alongside the environment reset.
- The 429 (locked) test writes `mfaFailures: 10` and a future `mfaLockedUntil` directly via `userRepository.updateMany`, bypassing the API to set the locked state.
- The "no attempt spent on wrong password" test asserts `mfaFailures` remains `0` after a failed password + OTP combo, confirming the OTP check is short-circuited when the password is invalid.
