# src/modules/account/controllers/delete-account-confirm.ts

## Purpose

Handler for the `DELETE /account/delete-confirm` endpoint. Validates a one-time account-deletion token, hard-deletes the account via the service layer, destroys session cookies, and returns an i18n-translated success or refusal message.

## Key elements

- **`ACCOUNT_DELETE_TOKEN_TYPE`** (`'delete'`) — constant identifying the token type this flow looks up.
- **`deleteAccountConfirm(request, response)`** (exported) — the route handler. Sequence:
  1. Parses and validates `request.body` against the `ConfirmAccountDeleteBody` Zod schema via `parseBody`.
  2. Calls `accountService.findLiveToken('delete', token)` to resolve the token to a user document.
  3. On a live token: calls `accountService.removeOwnAccount(user, callerContextOf(request))`, then destroys the refresh and logged-in cookies, and sends a 200 success.
  4. On a missing/invalid token: sends a uniform 422 refusal.
  5. On any unexpected error: sends a 500 with no detail.

## Relationships

- **`@infrastructure/http/controller`** — provides `parseBody`, the shared Zod-validation + early-return helper.
- **`@infrastructure/http/request`** — provides `callerContextOf`, extracted and passed into `removeOwnAccount`.
- **`@infrastructure/http/response`** — provides `successResponse` / `rejectResponse` for consistent response shaping.
- **`@infrastructure/i18n`** — provides `t` for all user-facing strings.
- **`../services`** — `accountService.findLiveToken` and `accountService.removeOwnAccount` do all persistence and mail publication.
- **`../session/cookies`** — `destroyRefreshCookie` / `destroyLoggedCookie` clear the client's session after deletion.
- **`../routes.ts`** — registers `deleteAccountConfirm` on the `DELETE /account/delete-confirm` path.
- **`@types`** — supplies the `AccountDeleteConfirmRequest` generic parameter for the Express handler signature.
- **`tests/unit/delete-account.test.ts`** — unit tests covering the success and refusal paths.

## Notes

- **Uniform refusal:** every "token not found" case returns the same 422 body so an attacker cannot distinguish an expired token from a never-issued one (see the note referenced in `services/tokens.ts`).
- **No separate token spend:** the token lives on the same document that is hard-deleted, so the delete itself invalidates it. A duplicate concurrent request simply finds no document and receives the uniform 422.
- **Goodbye mail is the service's job:** `removeOwnAccount` publishes the farewell email because, after the hard delete, the address no longer exists in the database and no other layer can read it.
