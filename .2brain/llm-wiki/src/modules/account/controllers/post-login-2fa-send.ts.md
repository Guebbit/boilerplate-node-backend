---
source: src/modules/account/controllers/post-login-2fa-send.ts
sha256: 7a85b1d5122ad16e17e9b1319f8518ab815cd3032f61fe1d02d4ecbd13253c51
generated_at: 2026-09-23T18:02:04.303669+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-login-2fa-send.ts

## Purpose

HTTP adapter for `POST /account/login/2fa/send`. Validates the incoming request, resolves a two-factor challenge token (from body or cookie), and delegates to `twoFactorService.sendLoginCode` to mail or text a one-time code. It is intentionally thin: no business logic beyond parsing and error mapping.

## Key elements

- **`postLoginTwoFactorSend(request, response)`** – the sole export. An async Express handler (`.then/.catch` style) that:
  - Safely parses `request.body` against the `SendTwoFactorCodeBody` Zod schema.
  - Falls back to `readMfaChallengeCookie` when `body.challenge` is absent (mirrors the fallback in `postLoginTwoFactor`).
  - Returns **401** if no valid challenge token is available.
  - Calls `twoFactorService.sendLoginCode(challenge, method, callerContext)` and maps the result to a **200** (with `TwoFactorDelivery` payload) or an error status.
  - Catches unexpected exceptions via `rejectDatabaseError`.
  - Increments the `authTwoFactorCodeSentTotal` Prometheus counter on **every** exit path (success *and* failure), labelled with `method` and `status`.

## Relationships

- **`src/modules/account/services/index.ts`** – imports `twoFactorService`; the only domain call made.
- **`src/modules/account/oauth/mfa-redirect.ts`** – imports `readMfaChallengeCookie` for the cookie-based challenge fallback.
- **`src/modules/account/metrics.ts`** – imports `authTwoFactorCodeSentTotal` counter.
- **`src/infrastructure/http/response.ts`** – uses `successResponse` / `rejectResponse` for consistent JSON envelopes.
- **`src/infrastructure/http/errors.ts`** – uses `rejectDatabaseError` for unexpected exceptions.
- **`src/infrastructure/http/controller.ts`** – uses `rejectValidation` for Zod parse failures.
- **`src/infrastructure/http/request.ts`** – uses `callerContextOf` to extract client metadata for the service call.
- **`src/infrastructure/i18n/index.ts`** – uses `t()` for user-facing error/success messages.
- **`src/types/index.ts`** – imports `TwoFactorSendRequest` (request body type) and `TwoFactorDelivery` (response payload type).
- **`src/modules/account/routes.ts`** – registers this handler on the `POST /account/login/2fa/send` route (implied by module placement and JSDoc).

## Notes

- The route is **public**; the challenge token itself is the authentication credential. There is no session or bearer-token check.
- The challenge fallback (`body.challenge ?? readMfaChallengeCookie(request)`) is duplicated from `postLoginTwoFactor` in `oauth/mfa-redirect.ts`. Keep the two in sync if the cookie-reading logic changes.
- The handler is **not** `async`; it returns the Promise chain directly. Express 4 handles it, but middleware that expects a resolved Promise (e.g. Express 5 async error handling) should be verified.
- Metric labels use `method: 'unknown'` for validation-failure paths where `method` hasn't been parsed yet.
