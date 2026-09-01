# src/modules/account/controllers/delete-account-request.ts

## Purpose

Controller handler for `DELETE /account`. Accepts an authenticated user's deletion request, looks up the user by email, and delegates to the account service to mint a one-time confirmation token and send it via email. The token never passes through this layer.

## Key elements

- **`deleteAccountRequest(request, response)`** — The sole export. Express controller function that:
  - Extracts the user's email via `authContextOf(request)`.
  - Looks up the user with `userService.findByEmail(email)`.
  - Calls `accountService.requestAccountDeletion(user, callerContextOf(request))` to trigger the confirmation-email flow.
  - Increments the `authAccountDeleteTotal` metric (`status: 'success' | 'failure'`).
  - Responds with `successResponse(…, 200, t('account.delete.email-sent'))` on both the found and not-found paths; `rejectResponse(…, 500)` on thrown errors.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure/http/request.ts` | Imports `authContextOf`, `callerContextOf` to read auth metadata and caller info from the request. |
| `src/infrastructure/http/response.ts` | Imports `successResponse`, `rejectResponse` for standardized HTTP replies. |
| `src/infrastructure/i18n/index.ts` | Imports `t` for user-facing translation keys (`account.delete.email-sent`). |
| `src/modules/users/index.ts` / `service.ts` | Calls `userService.findByEmail` to resolve the user record. |
| `src/modules/account/services/index.ts` | Calls `accountService.requestAccountDeletion` — the actual token-minting and email-sending logic lives there. |
| `src/modules/account/metrics.ts` | Increments `authAccountDeleteTotal` with a status label. |
| `src/modules/account/routes.ts` | Mounts this handler on the `DELETE /account` route (with `isAuth` middleware upstream). |
| `src/modules/account/tests/unit/delete-account.test.ts` | Unit-tests the controller's response paths and metric increments. |

## Notes

- **No user lookup failure leaks existence.** When `findByEmail` returns `null`, the handler still returns `200` with the "email-sent" message. This is deliberate: it avoids revealing whether an account exists for a given email.
- **Auth is not checked here.** The `isAuth` middleware (wired in `routes.ts`) is the sole gate; this file assumes the auth context is populated.
- **Token is opaque to this layer.** The controller never sees, stores, or returns the confirmation token — `accountService` mints it and the email infrastructure delivers it.
- **Error handling is intentionally broad.** The `.catch` swallows the specific error and returns a bare `500`; no error detail is forwarded to the client.
