---
source: src/modules/account/controllers/post-login-2fa.ts
sha256: 244fdd4cb39e49b203ba5000717553670dbe55d96bf2f6076f384b39789b5e8b
generated_at: 2026-11-14T18:32:58.809594+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-login-2fa.ts

## Purpose

HTTP adapter for `POST /account/login/2fa`, the second step of a two-factor login. It validates the challenge (obtained from the first `POST /account/login` response or from an OAuth-originated cookie), verifies the user-supplied code via `twoFactorService`, and on success mints a session with AMR proofs that include `otp`. It also handles the deletion-grace case where a verified code does not yield a session but a deletion-pending claim.

## Key elements

- **`postLoginTwoFactor`** (exported) — The sole handler. Accepts an Express `Request`/`Response`, parses the body with `LoginTwoFactorBody`, resolves the challenge from the body *or* the MFA cookie, calls `twoFactorService.verifyLoginChallenge`, then either:
  - returns a deletion-pending payload (when `isRestorable(user)` is true), or
  - issues a session via `issueSession`, records login success, attaches the account view, remembers the device cookie, and returns a `LoginTwoFactorOutcome`.
- Incremented **`authTwoFactorChallengeTotal`** on every exit path (success or failure).

## Relationships

- **`src/modules/account/services/index.ts`** — source of `twoFactorService`, which performs the actual code/challenge verification.
- **`src/modules/account/services/deletion-sign-in.ts`** — provides `buildDeletionPending` for the deletion-grace branch.
- **`src/modules/account/domain/session-proof.ts`** — provides `AMR` enum and `withProofs` to tag the session with `['pwd', 'otp']`.
- **`src/modules/account/oauth/mfa-redirect.ts`** — provides `readMfaChallengeCookie` / `destroyMfaChallengeCookie` for the OAuth-originated challenge path.
- **`src/modules/account/session/account-view.ts`** — `withAccountView` shapes the response body with the account snapshot.
- **`src/modules/account/metrics.ts`** — exports the `authTwoFactorChallengeTotal` counter incremented here.
- **`src/infrastructure/http/controller.ts`** — `parseBody` (Zod validation) and `refused` (standard error-shape helper).
- **`src/infrastructure/http/response.ts`** — `successResponse` / `rejectResponse` for uniform response envelopes.
- **`src/infrastructure/http/errors.ts`** — `rejectDatabaseError` for the `.catch` path.
- **`src/infrastructure/http/request.ts`** — `callerContextOf` extracts IP/UA metadata passed into the service.
- **`src/infrastructure/i18n/index.ts`** — `t()` for the localized "invalid challenge" message.
- **`src/modules/account/routes.ts`** — registers this handler on the `POST /account/login/2fa` route.

## Notes

- The challenge is **not** always in the request body. For OAuth-originated MFA the challenge was never sent to the client; it lives in a cookie set by `oauth/mfa-redirect.ts`. The handler falls back to `readMfaChallengeCookie` when `parsed.challenge` is absent.
- `provedAt` is captured **before** the async code check. This ensures a password change that lands mid-verification causes the service to refuse, rather than the controller silently accepting a stale timestamp.
- AMR is stored as an **array** (`['pwd', 'otp']`) specifically so that downstream session guards can assert "second factor present" without knowing which factor it was.
- `rememberDevice` is called only here (not in the first login step), making the 2FA-completion request the moment the browser becomes "familiar."
- The `.catch` path routes through `rejectDatabaseError`, which logs internally; there is no explicit logger import in this file.
