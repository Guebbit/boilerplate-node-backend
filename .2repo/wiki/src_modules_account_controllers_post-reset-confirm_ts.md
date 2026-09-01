# src/modules/account/controllers/post-reset-confirm.ts

## Purpose

Handles `POST /account/reset-confirm`: validates a one-time password-reset token (delivered via email link), verifies the new password pair, atomically spends the token, sets the new password, and invalidates all active sessions.

## Key elements

- **`postResetConfirm`** (exported) — The sole controller. Expects the token as a URL query parameter and `{ password, passwordConfirm }` in the JSON body. Orchestration order: parse body → find live token → validate password pair → atomically spend token → change password → destroy session cookies → 200.
- **`refuseToken`** (local helper) — Always returns `422` with the same i18n message (`account.reset.token-not-found`) regardless of *why* the token is unusable (missing, expired, already spent). Prevents token-existence enumeration.
- **`ConfirmPasswordResetBody`** — Zod schema (from `@api/schemas.zod`) used by `parseBody` to validate the request body.

## Relationships

- **`src/modules/account/services/index.ts`** — Primary dependency. `accountService.findLiveToken`, `.validatePasswordChange`, `.spendLiveToken`, `.passwordResetChange`, and the `PASSWORD_RESET_TOKEN_TYPE` constant all come from here. The service also owns the confirmation-email side effect.
- **`src/modules/account/session/cookies.ts`** — `destroyRefreshCookie` / `destroyLoggedCookie` clear the user's active sessions on success so all other devices are logged out.
- **`src/infrastructure/http/controller.ts`** — Provides `parseBody` (schema-validated body extraction) and `refused` (shared refusal check on service results).
- **`src/infrastructure/http/request.ts`** — `callerContextOf` extracts IP/user-agent context passed into `passwordResetChange` for audit logging.
- **`src/infrastructure/http/response.ts`** — `successResponse` / `rejectResponse` shape all HTTP replies.
- **`src/infrastructure/i18n/index.ts`** — `t()` supplies localized messages (error and success).
- **`src/modules/account/routes.ts`** — Registers `postResetConfirm` at `POST /account/reset-confirm`.
- **`src/types/index.ts`** — `PasswordResetConfirmRequest` defines the expected body shape for Express type parameters.

## Notes

- **Token lives in the URL, not the body.** It arrives as a query parameter on the link in the reset email. The body carries only the new password fields.
- **Validate-before-spend pattern.** Password validation runs *before* the atomic `spendLiveToken` call. A mistyped password therefore does **not** burn the one-time link; the user can retry. The race between two simultaneous confirms of the same link is resolved solely by the atomic `$pull` inside `spendLiveToken` — the loser receives the same 422 as an invented token.
- **Uniform failure responses.** Whether the token is missing, expired, or already spent, the response is identical (`422` + `account.reset.token-not-found`). This is deliberate; see the note referenced in `services/tokens.ts`.
- **Confirmation email is a service concern.** The controller does not send or publish any email; `accountService.passwordResetChange` handles that.
