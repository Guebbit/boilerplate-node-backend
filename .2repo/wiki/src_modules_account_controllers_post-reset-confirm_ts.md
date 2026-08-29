# src/modules/account/controllers/post-reset-confirm.ts

## Purpose

Controller for `POST /account/reset-confirm`. Validates a one-time password-reset token (delivered via email link), verifies the new-password pair, atomically consumes the token, updates the account's password, and destroys all active session cookies so the user must re-authenticate with the new credentials.

## Key elements

- **`postResetConfirm`** (exported) — The sole controller function. Orchestrates the full confirm flow: body parsing → token lookup → password validation → atomic token spend → password write → cookie teardown → success response.
- **`refuseToken`** (local closure) — Sends a uniform `422` with a single `account.reset.token-not-found` i18n string. Used for every token failure path (not found, already spent, race loser) to prevent token enumeration.

## Relationships

- **`@infrastructure/http/controller`** — Imports `parseBody` (validates raw body against a Zod schema, short-circuits the response on failure) and `refused` (checks a service result for a refusal and mirrors it onto the HTTP response).
- **`@infrastructure/http/request`** — Imports `callerContextOf` to extract request metadata (IP, user-agent, etc.) forwarded into `accountService.passwordResetChange`.
- **`@infrastructure/http/response`** — Imports `successResponse` and `rejectResponse` as the only way this controller writes to the HTTP response.
- **`@infrastructure/i18n`** — Imports `t` for localising user-facing messages (`account.reset.token-not-found`, `account.reset.success`).
- **`../services`** — Imports `accountService` and `PASSWORD_RESET_TOKEN_TYPE`; all domain logic (token lookup, validation, atomic spend, password write) lives in the service layer.
- **`../session/cookies`** — Imports `destroyRefreshCookie` and `destroyLoggedCookie` to invalidate all active sessions after a successful reset.
- **`@types`** — Imports `PasswordResetConfirmRequest` for the typed body shape (token, password, passwordConfirm).
- **`@modules/account/routes.ts`** — Registers this handler as the `POST /account/reset-confirm` route.

## Notes

- **Two-phase token consumption is intentional.** `findLiveToken` is a read; `spendLiveToken` is an atomic `$pull` that returns a boolean indicating whether *this* request removed the entry. The read-validate-spend ordering ensures a mistyped password confirmation does not burn a one-time token. A race loser receives the same `refuseToken` response as an invalid token.
- **Token source.** Despite the Express path-params type declaring `token?: string`, the code reads `token` exclusively from the parsed request body. The token originally arrives in the email link URL and is submitted as a form field.
- **Password confirmation email** is published inside `accountService.passwordResetChange`, not in this controller.
- **All token failures are indistinguishable** (422, single message) by design; see the note in `services/tokens.ts` for the security rationale.
