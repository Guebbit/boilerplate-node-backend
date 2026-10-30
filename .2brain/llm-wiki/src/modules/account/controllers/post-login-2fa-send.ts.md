---
source: src/modules/account/controllers/post-login-2fa-send.ts
sha256: 279de6151e5d155db7e058e4420b9306b483405c50c75f40eb5e5f91e6881c6b
generated_at: 2026-10-29T02:29:55.537596+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-login-2fa-send.ts

## Purpose

Thin HTTP adapter for `POST /account/login/2fa/send`. Validates the request body, resolves a 2FA challenge token, delegates to `twoFactorService.sendLoginCode`, and returns the delivery result. Exists to keep the login flow's two-factor step as a single, self-contained Express handler that routes can register directly.

## Key elements

- **`postLoginTwoFactorSend`** (default export) — Express handler that:
  - Parses the body against the `SendTwoFactorCodeBody` Zod schema.
  - Resolves the challenge from the body or falls back to the `mfa-redirect` cookie.
  - Calls `twoFactorService.sendLoginCode(challenge, method, callerContext)`.
  - Responds with `TwoFactorDelivery` on success, or a structured error on failure.
  - Increments `authTwoFactorCodeSentTotal` on every exit path (validation failure, challenge missing, service refusal, DB error, success).

## Relationships

- **`@infrastructure/http/controller`** — provides `parseBody` (Zod validation) and `refused` (service-level rejection check).
- **`@infrastructure/http/response`** — `successResponse` / `rejectResponse` shape the JSON envelope.
- **`@infrastructure/http/errors`** — `rejectDatabaseError` maps thrown DB/service errors to a safe HTTP response.
- **`@infrastructure/http/request`** — `callerContextOf` extracts caller metadata (IP, user-agent) for the service layer.
- **`@infrastructure/i18n`** — `t` localises the user-facing error string for a missing/invalid challenge.
- **`../services` (`twoFactorService`)** — the actual business logic that generates and dispatches the code.
- **`../oauth/mfa-redirect` (`readMfaChallengeCookie`)** — supplies the challenge token from the session cookie when the client does not send it in the body.
- **`../metrics` (`authTwoFactorCodeSentTotal`)** — Prometheus counter tracking send attempts by method and outcome.
- **`../routes`** — registers this handler on the `POST /account/login/2fa/send` path.
- **`@types`** — `TwoFactorSendRequest` and `TwoFactorDelivery` type the request/response payloads.

## Notes

- The endpoint is **public**; the challenge token itself is the bearer credential. No auth middleware is expected.
- Challenge resolution mirrors the fallback in `postLoginTwoFactor`: body field first, then the `mfa-redirect` cookie. Keeping them in sync matters if the cookie name or shape changes.
- Every code path (even a schema parse failure) emits a metric increment, so dashboards should expect `method: "unknown"` for unparseable bodies.
