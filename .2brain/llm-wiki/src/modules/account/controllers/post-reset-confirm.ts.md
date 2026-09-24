---
source: src/modules/account/controllers/post-reset-confirm.ts
sha256: aa622fd31ca6888914b6b0d1b943e0f0196f8d09f74b6609ac2a81d054b05e92
generated_at: 2026-09-23T18:03:36.225761+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-reset-confirm.ts

## Purpose

Handles `POST /account/reset-confirm`. Validates a one-time reset token (delivered in a URL from the reset email), verifies the new password, atomically spends the token, changes the password via the account service, and invalidates the user's active sessions.

## Key elements

- **`resetConfirmShape`** — Zod schema extending `ConfirmPasswordResetBody` with bare `password` / `passwordConfirm` string fields. Password-strength rules are intentionally omitted (see Notes).
- **`postResetConfirm`** — The exported Express handler. Pipeline: parse body → `findLiveToken` → `validatePasswordChange` → `spendLiveToken` (atomic) → `passwordResetChange` → destroy session cookies → 200 response. All failure paths funnel through `rejectResponse(422, …)` or `refuseToken`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `@infrastructure/http/controller` | Imports `parseBody`, `refused`, `catchAs` for body validation, result inspection, and top-level error catching. |
| `@infrastructure/http/request` | Imports `callerContextOf` to pass request context into `passwordResetChange`. |
| `@infrastructure/http/response` | Imports `successResponse` and `rejectResponse` for all HTTP output. |
| `@infrastructure/i18n` | Imports `t` to localise user-facing messages (token-not-found, success). |
| `../services` (account) | Imports `accountService` (token lookup, spend, validate, change) and the `PASSWORD_RESET_TOKEN_TYPE` constant. |
| `../session/cookies` | Imports `destroyRefreshCookie` and `destroyLoggedCookie` to log the user out of all sessions after a reset. |
| `@types` | Imports the `PasswordResetConfirmRequest` body type used in the Express `Request` generic. |
| `src/modules/account/routes.ts` | The route table that wires this handler to `POST /account/reset-confirm`. |

## Notes

- **Dropped Zod password rules are deliberate.** The schema keeps `password` / `passwordConfirm` as plain `z.string()`. If strength rules (e.g. `minLength`) were present, Zod would reject first and the caller would see the generic size message, shadowing the field-specific copy produced later by `accountService.validatePasswordChange`. The service's validation runs once the token is confirmed live.
- **Validate-before-spend ordering is a safety invariant.** A mistyped or too-weak password must not consume the one-time link. Only after validation passes does the handler call `spendLiveToken`.
- **Race safety.** Two concurrent confirms of the same link both pass the `findLiveToken` read; the atomic `$pull` inside `spendLiveToken` ensures only one request reports success. The loser receives the same `422 token-not-found` body as an invented token — preventing token enumeration.
- **Token arrives via URL** (the email link), typed through the `token?` path param in the `Request` generic, and is merged into the parsed body before use.
