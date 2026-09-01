# src/modules/account/controllers/delete-account-confirm.ts

## Purpose

Handler for `DELETE /account/delete-confirm`. Validates a one-time account-deletion token, spends it atomically, then delegates the hard-delete to the account service. It is the final step in the "confirm deletion" flow (the earlier step only issues the token/link).

## Key elements

- **`deleteAccountConfirm`** (exported) — Express controller. Parses the JSON body against `ConfirmAccountDeleteBody` (Zod), extracts the `token`, then chains:
  1. `accountService.findLiveToken('delete', token)` — looks up the pending token.
  2. `accountService.spendLiveToken(user, token)` — atomically marks the token as consumed; returns a boolean indicating *this* request won the spend.
  3. `accountService.removeOwnAccount(user, callerContext)` — hard-deletes the account (and sends the goodbye email).
  On success destroys the refresh and logged-in cookies and returns `200`.
- **`refuseToken`** (local) — Closes with `422` and a single generic i18n error (`account.delete.token-not-found`) for *every* refusal path, so callers cannot distinguish "bad token" from "already spent."
- **`ACCOUNT_DELETE_TOKEN_TYPE`** — Constant `'delete'`; the discriminator value stored in the `tokens` collection.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/account/services/index.ts` | Calls `accountService.findLiveToken`, `spendLiveToken`, `removeOwnAccount` — all account-state logic lives there. |
| `src/modules/account/session/cookies.ts` | Calls `destroyRefreshCookie` / `destroyLoggedCookie` after a successful delete to clear session cookies. |
| `src/infrastructure/http/controller.ts` | Uses `parseBody` to validate the raw body against the Zod schema and short-circuit on failure. |
| `src/infrastructure/http/request.ts` | Uses `callerContextOf(request)` to extract the authenticated caller's context for audit/logging. |
| `src/infrastructure/http/response.ts` | Uses `successResponse` / `rejectResponse` for all HTTP replies. |
| `src/infrastructure/i18n/index.ts` | Uses `t()` for user-facing error/success strings. |
| `src/types/index.ts` | Imports the `AccountDeleteConfirmRequest` body type used in the Express generic. |
| `src/modules/account/routes.ts` | Registers `deleteAccountConfirm` on the `DELETE /account/delete-confirm` route. |
| `src/modules/account/tests/unit/delete-account.test.ts` | Unit-tests the controller (token found / not found / already spent / service error paths). |

## Notes

- **Uniform 422 refusal.** Whether the token is absent, wrong-type, or already spent, the response is identical (`422`, single i18n code). This is deliberate (see comment referencing `services/tokens.ts`) to prevent token enumeration.
- **Atomic spend.** `spendLiveToken` returns a boolean; only the request that actually flips the token proceeds. This protects against concurrent duplicate deletes.
- **Goodbye email is the service's job.** The controller never reads the e-mail address after `removeOwnAccount` resolves—the document is already gone. The service sends the mail *before* deleting.
- **Catch-all 500.** Any unhandled rejection in the promise chain is swallowed and returned as `500` with an empty error array; no stack trace leaks to the client.
