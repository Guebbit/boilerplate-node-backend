---
source: src/modules/account/controllers/post-login-2fa-send.ts
sha256: e27a4d14f1dd5051f0675f98430d05989b0b3d9c503d4687d027d1dc5a80bc56
generated_at: 2026-09-27T14:24:32.877273+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-login-2fa-send.ts

## Purpose

Thin HTTP adapter for `POST /account/login/2fa/send`. Validates the request body, resolves a 2FA challenge token (from body or cookie), delegates to `twoFactorService.sendLoginCode`, and shapes the HTTP response. The endpoint is intentionally public — the challenge token itself is the credential, consistent with the rest of the login flow.

## Key elements

- **`postLoginTwoFactorSend`** (exported) — The sole controller function. Accepts Express `Request`/`Response`. Steps:
  1. Safe-parses the body with `SendTwoFactorCodeBody` (Zod schema); rejects with validation error on failure.
  2. Resolves the 2FA `challenge` from the body field, falling back to `readMfaChallengeCookie(request)`. Rejects with 401 if absent.
  3. Calls `twoFactorService.sendLoginCode(challenge, method, callerContext)`; responds 200 with `TwoFactorDelivery` payload on success.
  4. Every terminal path increments the `authTwoFactorCodeSentTotal` Prometheus counter with `{ method, status }` labels.

## Relationships

- **`src/modules/account/services/index.ts`** — Calls `twoFactorService.sendLoginCode`, the actual business-logic unit.
- **`src/modules/account/oauth/mfa-redirect.ts`** — Imports `readMfaChallengeCookie` as the cookie-based fallback for the challenge token (mirrors the same fallback used in `postLoginTwoFactor`).
- **`src/modules/account/metrics.ts`** — Imports `authTwoFactorCodeSentTotal` counter; incremented on every success/failure branch.
- **`src/infrastructure/http/controller.ts`** — Provides `rejectValidation` (Zod parse failure) and `refused` (service-level refusal check).
- **`src/infrastructure/http/errors.ts`** — Provides `rejectDatabaseError` for the catch-all error path.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` and `rejectResponse` helpers.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf` to extract caller metadata from the request.
- **`src/infrastructure/i18n/index.ts`** — Provides the `t()` translation function for user-facing messages.
- **`src/types/index.ts`** — Source of `TwoFactorSendRequest` and `TwoFactorDelivery` type contracts.
- **`src/modules/account/routes.ts`** — Wires this controller to the `POST /account/login/2fa/send` route.

## Notes

- The `challenge` field is **optional** in the request body; the cookie fallback means a client that omits it still works, as long as the `mfa-redirect` cookie was set upstream. If neither is present, the response is a 401, not a 400.
- When the body fails Zod parsing, the metric label uses `method: 'unknown'` because the `method` field cannot be trusted yet.
- The controller is synchronous in signature but returns a `Promise` (from `.then/.catch`); it is not declared `async`. Ensure the route handler does not double-wrap in a Promise.
- The file's JSDoc and inline comments reference `postLoginTwoFactor` (the verify endpoint) as the sibling that makes the same cookie fallback — useful context when modifying either file.
