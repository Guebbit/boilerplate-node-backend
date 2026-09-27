---
source: src/modules/account/controllers/post-reset-confirm.ts
sha256: 7f9af1e9e3d1dfbc2b0c6a2634e2e1f545ed37aa25207e53e328df4c1b90096b
generated_at: 2026-09-27T14:25:59.254227+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-reset-confirm.ts

## Purpose

Handles `POST /account/reset-confirm`: validates the user-supplied new password, redeems the one-time reset token (arriving from the emailed link), sets the new password, and invalidates all active sessions. It is the final step in the password-reset flow.

## Key elements

- **`resetConfirmShape`** – Zod schema built by extending `ConfirmPasswordResetBody` with bare `z.string()` for `password` and `passwordConfirm`. Password *rules* (min-length, complexity, etc.) are intentionally omitted so the service's own error copy surfaces instead of a generic size message.
- **`postResetConfirm`** (exported handler) – The controller function. Sequence:
  1. `parseBody` validates the request body against `resetConfirmShape`.
  2. `accountService.validatePasswordChange` checks password rules *before* any token lookup (pure, no DB), returning 422 on failure so a mistyped password doesn't consume the link.
  3. `accountService.redeemLiveToken(PASSWORD_RESET_TOKEN_TYPE, token)` atomically spends the token; returns 422 if not found.
  4. `accountService.passwordResetChange` sets the new password and publishes the confirmation email.
  5. On success: destroys the refresh and logged-in cookies, then responds 200 with the i18n `account.reset.success` message.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure/http/controller.ts` | Provides `parseBody`, `refused`, `catchAs` helpers used for validation and error short-circuiting. |
| `src/infrastructure/http/request.ts` | Provides `callerContextOf(request)`, passed into `passwordResetChange` so the service can stamp audit context. |
| `src/infrastructure/http/response.ts` | Provides `successResponse` and `rejectResponse` for all exit paths. |
| `src/infrastructure/i18n/index.ts` / `context.ts` | Provides `t()` for user-facing messages (`account.reset.token-not-found`, `account.reset.success`). |
| `src/modules/account/services/index.ts` | Primary dependency: `accountService.validatePasswordChange`, `accountService.redeemLiveToken`, `accountService.passwordResetChange`, and the `PASSWORD_RESET_TOKEN_TYPE` constant. |
| `src/modules/account/session/cookies.ts` | `destroyRefreshCookie` and `destroyLoggedCookie` are called after a successful reset to force re-authentication everywhere. |
| `src/modules/account/routes.ts` | Registers `postResetConfirm` as the handler for `POST /account/reset-confirm`. |
| `src/types/index.ts` | Exports the `PasswordResetConfirmRequest` body type used in the `Request` generic. |

## Notes

- **Password validation precedes token lookup on purpose.** The comment states this is so a mistyped password cannot "burn" a valid link; the check is pure (no user, no DB).
- **Atomic token spend.** Two simultaneous confirms of the same link both see the token as live; only the winning `$pull` inside `redeemLiveToken` actually spends it. The loser receives the same "token not found" response as a fabricated token.
- **Token source ambiguity.** The `Request` generic declares `token?: string` in the path-params slot, yet the code reads `token` from the parsed body (it lives inside `ConfirmPasswordResetBody`). The path param appears vestigial or used by an alternate route shape.
- **Email dispatch lives in the service, not the controller.** The comment explicitly defers to `services/profile.ts` for publishing the confirmation mail, treating it as an account fact rather than an HTTP concern.
