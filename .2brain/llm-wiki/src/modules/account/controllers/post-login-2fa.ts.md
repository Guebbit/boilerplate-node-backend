---
source: src/modules/account/controllers/post-login-2fa.ts
sha256: 687623abbf90db7896b82ee001f0df607629c69099ce7052454c21916a05a0e4
generated_at: 2026-11-08T04:05:18.145467+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-login-2fa.ts

## Purpose

Controller for `POST /account/login/2fa` — the second step of a two-factor login. It validates the challenge token and the user-supplied code (or backup code), then mints a full session identical to a single-factor `postLogin`, appending `otp` to the AMR array so downstream guards see the second factor as satisfied.

## Key elements

- **`postLoginTwoFactor`** (exported function) — Express handler that:
  1. Parses and validates the request body via `LoginTwoFactorBody` (zod schema).
  2. Resolves the challenge from the body (password-originated) or from an MFA cookie (OAuth-originated, set by the redirect flow).
  3. Calls `twoFactorService.verifyLoginChallenge` with the caller context.
  4. On success, either builds a deletion-pending view (if the account is in its grace period) or calls `issueSession` with `AMR.otp` added to the proofs.
  5. Records the login, attaches the account view, remembers the device, destroys the MFA challenge cookie, and returns a 200.
  6. Increments `authTwoFactorChallengeTotal` (status `success` | `failure`) on every path.

## Relationships

- **`src/modules/account/services/index.ts`** — calls `twoFactorService.verifyLoginChallenge` and `accountService.buildDeletionPending`.
- **`src/modules/account/session/session.ts`** — calls `issueSession` to mint the final session (not listed in graph but imported directly).
- **`src/modules/account/session/account-view.ts`** — wraps the issued session body with `withAccountView`.
- **`src/modules/account/session/device-cookie.ts`** — calls `rememberDevice` to set the "trusted device" cookie on successful login.
- **`src/modules/account/domain/session-proof.ts`** — imports `AMR` and `withProofs` to append the `otp` proof to the AMR array.
- **`src/modules/account/oauth/mfa-redirect.ts`** — imports `readMfaChallengeCookie` / `destroyMfaChallengeCookie` to handle OAuth-originated challenges stored server-side.
- **`src/modules/account/metrics.ts`** — increments `authTwoFactorChallengeTotal` on every outcome.
- **`src/modules/account/routes.ts`** — registers this handler at the `POST /account/login/2fa` route.
- **`src/infrastructure/http/controller.ts`** — uses `parseBody` and `refused` for body validation and service-result short-circuiting.
- **`src/infrastructure/http/response.ts`** — uses `successResponse` and `rejectResponse` for standardized JSON output.
- **`src/infrastructure/http/errors.ts`** — uses `rejectDatabaseError` in the `.catch` path.
- **`src/infrastructure/http/request.ts`** — uses `callerContextOf` to extract IP/UA for the service call.
- **`src/infrastructure/i18n/index.ts`** — uses `t()` for the challenge-invalid error message.

## Notes

- **Challenge source is dual-path**: password-flow challenges arrive in the request body; OAuth-flow challenges are never sent to the client and are read from a server-side cookie instead. The code falls back from body to cookie (`parsed.challenge ?? readMfaChallengeCookie(request)`).
- **`provedAt` is captured before the async service call** so a password change that lands mid-verification is reflected in the session timestamp.
- **Deletion grace takes priority over session minting**: if `isRestorable(user)` is true, the handler returns a deletion-pending payload instead of issuing a session, even though the 2FA code was valid.
- **The MFA challenge cookie is destroyed on every terminal path** (success, deletion-pending, and is left intact on failure so the client can retry or re-initiate).
- **`rememberDevice` is only called on the full-session path**, not on the deletion-pending path — the browser is not marked as familiar until a real session exists.
