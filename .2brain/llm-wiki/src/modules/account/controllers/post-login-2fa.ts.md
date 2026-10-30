---
source: src/modules/account/controllers/post-login-2fa.ts
sha256: 9617035d35df4b19f09cfc3fd9d3497a2e0fc46b21254e508d42e7f6277612ae
generated_at: 2026-10-29T02:30:07.086195+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-login-2fa.ts

## Purpose

HTTP controller for `POST /account/login/2fa`, the second leg of a two-factor login. It verifies the challenge returned by `POST /account/login` against the caller's code (or backup code), then mints a full session with an `otp` AMR proof — mirroring what `postLogin` does for single-factor accounts.

## Key elements

- **`postLoginTwoFactor(request, response)`** — sole export. Orchestrates the full second-factor flow:
  - Validates the request body against `LoginTwoFactorBody` (zod).
  - Resolves the challenge from the body *or* from the MFA challenge cookie (OAuth-originated challenges never reach the client).
  - Captures `provedAt` **before** verification so a concurrent password change can invalidate the attempt.
  - Delegates code verification to `twoFactorService.verifyLoginChallenge`, passing `callerContextOf(request)`.
  - On a **restorable** user (deletion grace period), responds with `accountService.buildDeletionPending` instead of a session.
  - On normal success, calls `issueSession` with `{ amr: withProofs(amr, AMR.otp), provedAt, remember, transport }`, then records login observability, increments the Prometheus counter, destroys the MFA challenge cookie, and calls `rememberDevice`.
  - On any failure path, increments `authTwoFactorChallengeTotal` with `status: 'failure'` and responds via `rejectResponse` / `rejectDatabaseError`.

## Relationships

- **`../services`** — pulls `twoFactorService` (challenge verification) and `accountService` (deletion-pending payload).
- **`../session/session`** — `issueSession` mints the actual session; this controller is one of its callers.
- **`../session/device-cookie`** — `rememberDevice` sets the browser-familiarity cookie only on the final success step.
- **`../session/login-observability`** — `recordLoginSuccess` logs the completed login.
- **`../metrics`** — `authTwoFactorChallengeTotal` Prometheus counter, incremented on every terminal outcome.
- **`../oauth/mfa-redirect`** — `readMfaChallengeCookie` / `destroyMfaChallengeCookie` handle the OAuth challenge path where the challenge lives in a cookie rather than the request body.
- **`../domain/session-proof`** — `AMR.otp` constant and `withProofs` helper to build the session's AMR array.
- **`@infrastructure/http/controller`** — `parseBody` (zod validation) and `refused` (standard error-response helper).
- **`@infrastructure/http/response` / `errors`** — `successResponse`, `rejectResponse`, `rejectDatabaseError` shape the HTTP reply.
- **`@infrastructure/http/request`** — `callerContextOf` extracts the caller's context for the service call.
- **`@infrastructure/i18n`** — `t()` localises the challenge-invalid error message.
- **`../routes.ts`** — registers this handler on the `POST /account/login/2fa` route.

## Notes

- **Challenge source is dual-path.** Password-originated challenges arrive in the request body; OAuth-originated ones are stored in a cookie (`readMfaChallengeCookie`) and never sent to the client. The `??` fallback in the code handles both transparently.
- **`provedAt` is captured before `verifyLoginChallenge`.** This is intentional: if the password changes during verification, the session will be rejected downstream. Do not move the `Date.now()` call after the service call.
- **The code (OTP vs. backup) is opaque to this controller.** The service decides which factor matched; the controller only receives the resulting `amr` array and forwards it.
- **Restorable users skip session issuance entirely.** They get a `deletionPending` payload and the challenge cookie is destroyed, so the challenge is single-use regardless of outcome.
- **Metrics are incremented exactly once per request**, on every exit path (parse failure, missing challenge, service refusal, success, and catch).
