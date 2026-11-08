---
source: src/modules/account/controllers/post-login-2fa-send.ts
sha256: 279de6151e5d155db7e058e4420b9306b483405c50c75f40eb5e5f91e6881c6b
generated_at: 2026-11-08T04:05:04.528145+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-login-2fa-send.ts

## Purpose

Thin HTTP adapter that handles `POST /account/login/2fa/send`. It validates the request body, resolves a two-factor challenge token, delegates to `twoFactorService.sendLoginCode`, and returns the delivery result. It exists to keep the login 2FA flow's I/O concerns (body parsing, response shaping, metrics) separate from the service layer.

## Key elements

- **`postLoginTwoFactorSend(request, response)`** — The sole export. Express handler that:
  - Parses the body against `SendTwoFactorCodeBody` (Zod).
  - Resolves the challenge: `parsed.challenge` first, falling back to the MFA cookie via `readMfaChallengeCookie`.
  - Calls `twoFactorService.sendLoginCode(challenge, method, callerContext)`.
  - Responds 200 with `TwoFactorDelivery` on success, 401 with a localized error if no challenge is found, or a database error via `rejectDatabaseError`.
  - Increments the `authTwoFactorCodeSentTotal` counter on every exit path (success / failure / unknown method).

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/account/services/index.ts` | Calls `twoFactorService.sendLoginCode` — the core business logic. |
| `src/infrastructure/http/controller.ts` | Uses `parseBody` for Zod validation and `refused` to short-circuit on service-level rejection. |
| `src/infrastructure/http/response.ts` | Emits `successResponse` (200) and `rejectResponse` (401). |
| `src/infrastructure/http/errors.ts` | `rejectDatabaseError` maps unexpected exceptions to a safe HTTP error. |
| `src/infrastructure/http/request.ts` | `callerContextOf` extracts caller metadata (IP, user-agent, etc.) for the service call. |
| `src/infrastructure/i18n/index.ts` | `t` provides the localized "challenge invalid" message. |
| `src/modules/account/metrics.ts` | `authTwoFactorCodeSentTotal` Prometheus counter, tagged with `method` and `status`. |
| `src/modules/account/oauth/mfa-redirect.ts` | `readMfaChallengeCookie` — cookie fallback when the client omits the `challenge` field (mirrors the pattern in `postLoginTwoFactor`). |
| `src/types/index.ts` | `TwoFactorSendRequest` (route generic) and `TwoFactorDelivery` (response payload type). |
| `src/modules/account/routes.ts` | Registers this handler on the `POST /account/login/2fa/send` route. |
| `src/infrastructure/adapters/logger.ts` | Indirect dependency through `rejectDatabaseError` / service internals; no direct import here. |

## Notes

- The endpoint is **public** (no auth middleware); the challenge token in the body or cookie is the credential.
- The cookie fallback (`readMfaChallengeCookie`) exists for parity with `postLoginTwoFactor` in `mfa-redirect.ts`; if you change the challenge-resolution order here, keep both in sync.
- Metrics use `method: 'unknown'` when body parsing fails, since no delivery method was extracted yet.
- `refused(response, result)` is a helper that checks whether the service returned a rejection *and* already wrote the response; the handler returns early in that case without touching metrics a second time.
