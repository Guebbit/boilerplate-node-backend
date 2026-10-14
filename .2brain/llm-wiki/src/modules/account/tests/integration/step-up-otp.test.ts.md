---
source: src/modules/account/tests/integration/step-up-otp.test.ts
sha256: d82f46d5c3aa06f2854946793353b24fffc5216fb8d30a98272a647bc2115192
generated_at: 2026-10-14T14:42:51.672392+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/step-up-otp.test.ts

## Purpose

Integration tests verifying that identity routes (email change, password change, account deletion) enforce an `otp` re-authentication challenge when the account has a second factor armed, that `/account/reauth` correctly grants or denies OTP proof, and that email-change undo tokens work as expected. Also confirms none of these gates apply to accounts without 2FA.

## Key elements

- **`armedAccount`** – Helper that creates a user, logs in, sets up and confirms TOTP via the API, then returns the user record and backup codes.
- **`sessionWith(userId, amr)`** – Mints a fresh access + refresh token pair (via `continueSession`/`createAccessToken`) for a given `amr` array, simulating a session that proved a specific set of methods.
- **`tokenOfLastMail(template)`** – Extracts the `token` query param from the most recent entry in the mock outbox matching a given email template.
- **`mockOutbox`** – In-memory array that captures every `enqueueEmail` call (the mailer is jest-mocked).
- **`describe('the identity routes…')`** – Asserts 401 `REAUTH_REQUIRED` with `details.methods: ['otp']` for password-only sessions, 200 for `['pwd','otp']` sessions, and that no-2FA accounts pass through unchanged.
- **`describe('POST /account/reauth…')`** – Verifies that re-auth with a valid OTP code earns the `otp` amr, a wrong code yields 422, a locked account yields 429, a wrong password does not increment `mfaFailures`, and an account without 2FA rejects OTP with 422.
- **`describe('undoing an email change')`** – Tests that the old address's undo token restores the prior email, invalidates all sessions (`tokensValidAfter` set), cancels a still-pending change and kills its confirmation link, is single-use, and survives a completed password reset that purges other pending tokens.

## Relationships

- **`src/modules/account/session/jwt.ts`** – Provides `createAccessToken` and `continueSession`, used by `sessionWith` to mint test sessions directly at the token layer.
- **`src/modules/account/tests/factories.ts`** – Exports `plantToken` and `removeTokensOfKind` (imported here; used in truncated later sections).
- **`src/modules/users/repository.ts`** – `userRepository.findByIdWithCredentials` and `userRepository.updateMany` are used to assert stored state (email, `mfaFailures`, `tokensValidAfter`, `pendingEmail`).
- **`src/modules/users/tests/factories.ts`** – Supplies `createUser`, `PLAIN_PASSWORD`, `REPLACEMENT_PASSWORD` for fixture creation and password-change payloads.
- **`tests/support/environment.ts`** – `setEnvironment` configures `NODE_MAIL_TRANSPORT` to `'outbox'` so the mock mailer is active.
- **`tests/support/http.ts`** – `api()` provides the supertest-style HTTP client used for every request in the file.
- **`tests/support/session-epoch.ts`** – `forgetSessionEpoch` invalidates the session-epoch guard after `armedAccount` so subsequent API calls are not rejected for staleness.
- **`tests/support/setup-test-db.ts`** – `setupTestDb` resets the in-memory/test database before the suite runs.
- **`tests/support/totp.ts`** – `codeFor` generates a valid TOTP code from a secret for the confirm step and reauth assertions.

## Notes

- The mailer is jest-mocked at the module level (`@infrastructure/adapters/mailer`), so no real email is sent; assertions on "what was mailed" read from `mockOutbox`.
- `sessionWith` deliberately uses `continueSession` (a re-mint) rather than a first-session creation, because a first-session mint would be rejected when the account already has a factor armed.
- `forgetSessionEpoch` is called after `armedAccount` to prevent the session-epoch mechanism from interfering with subsequent test requests.
- The test file is truncated in the provided content; the "survives a completed password reset" test and any further `describe` blocks are incomplete.
- `statusOf` is a small helper that extracts `.status` from a pending response promise, used to assert status codes without duplicating `expect(...).toBe(...)` inline.
