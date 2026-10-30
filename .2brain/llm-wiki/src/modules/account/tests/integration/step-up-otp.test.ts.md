---
source: src/modules/account/tests/integration/step-up-otp.test.ts
sha256: ca9cc130b881e8c78fafa57e17d3acb757c0431884f23325b43f447bbfe42e64
generated_at: 2026-10-29T03:02:30.751457+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/step-up-otp.test.ts

## Purpose

Integration test suite that verifies step-up authentication behavior for account identity routes. It asserts that when an account has TOTP armed, sensitive routes (email change, password change, account deletion) return `401 REAUTH_REQUIRED` unless the session's `amr` includes `otp`; that a re-authentication earns only the factors it actually proved; and that an email change can be undone via a token mailed to the old address. Accounts without a second factor are unaffected.

## Key elements

- **`mockOutbox`** — module-level array that captures every call to `enqueueEmail` (via `jest.mock` on the mailer adapter), enabling assertions on mailed links and tokens without a real transport.
- **`sessionWith(userId, amr)`** — mints a fresh access token + refresh cookie directly from the JWT layer (`continueSession` → `createAccessToken`) with the specified `amr` array. Stands in for a pre-existing session that a first-session mint would refuse.
- **`tokenOfLastMail(template)`** — extracts the `token` query-param from the most recent mailed `linkUrl` for a given template.
- **`armedAccount(email?)`** — full setup helper: creates a verified user, logs in, initiates and confirms TOTP, calls `forgetSessionEpoch`. Returns `{ user, backupCodes }`.
- **`statusOf(pending)`** / **`emailOf(userId)`** / **`undo(token)`** / **`requestChange(bearer)`** / **`requested()`** — small helpers for asserting on response status, reading the stored email, sending the undo/confirm tokens, and setting up a pending email-change scenario.
- **`describe('the identity routes, …')`** — six tests covering 401 vs 200 for email change, password change, and deletion, with and without `otp` in `amr`.
- **`describe('POST /account/reauth with an otp')`** — five tests covering: password-only re-auth drops `otp`; OTP code earns `otp`; wrong code → 422; locked account → 429; wrong password does not increment `mfaFailures`; OTP on a non-armed account → 422.
- **`describe('undoing an email change')`** — tests that the undo token (mailed to the old address) restores the old email, clears `previousEmail`, bumps `tokensValidAfter`, and invalidates a still-pending confirm link.

## Relationships

- **`src/modules/account/session/jwt.ts`** — imports `createAccessToken` and `continueSession` to mint sessions with arbitrary `amr` arrays, bypassing the normal login flow.
- **`src/modules/account/tests/factories.ts`** — imports `plantToken` and `removeTokensOfKind` for token-state manipulation (used in the truncated remainder of the file).
- **`src/modules/users/repository.ts`** — imports `userRepository` to read stored fields (`email`, `mfaFailures`, `previousEmail`, `pendingEmail`, `tokensValidAfter`) and to directly set `mfaFailures` / `mfaLockedUntil` for the lockout test.
- **`src/modules/users/tests/factories.ts`** — imports `createUser`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD` for user creation and password payloads.
- **`tests/support/environment.ts`** — calls `setEnvironment({ NODE_MAIL_TRANSPORT: 'outbox' })` in `beforeEach` so the app routes mail through the mocked adapter.
- **`tests/support/http.ts`** — imports `api()` for all HTTP calls against the running test server.
- **`tests/support/session-epoch.ts`** — calls `forgetSessionEpoch` after arming TOTP to reset any epoch the setup session consumed.
- **`tests/support/setup-test-db.ts`** — calls `setupTestDb()` once at module load to provision a clean database.
- **`tests/support/totp.ts`** — imports `codeFor` to generate valid TOTP codes from a secret for the confirm step.

## Notes

- The mailer is mocked at the adapter level (`@infrastructure/adapters/mailer`), not at the HTTP layer. The `NODE_MAIL_TRANSPORT: 'outbox'` env var in `beforeEach` tells the app to use that adapter, so the mock actually intercepts.
- `sessionWith` intentionally produces a *re-minted* session (refresh → access) rather than a first-session token, because a first-session mint would be rejected by the step-up guard for a newly armed account.
- The lockout test writes `mfaFailures: 10` and `mfaLockedUntil` directly via `userRepository.updateMany` — it does not replay ten failed attempts.
- `forgetSessionEpoch` is called inside `armedAccount` after the confirm step; forgetting it in new tests that reuse that helper will cause unexpected epoch-mismatch failures.
- The file is truncated in the dependency graph snapshot; the `undoing an email change` describe block and any subsequent blocks are cut off mid-test.
