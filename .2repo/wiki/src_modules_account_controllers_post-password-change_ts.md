# src/modules/account/controllers/post-password-change.ts

## Purpose

HTTP controller for `POST /account/password`. It validates the incoming body, delegates to `accountService.passwordChangeWithCurrent` to verify the current password and set a new one, then re-mints the caller's session token so the user stays signed in. It exists as a thin Express adapter separating HTTP concerns (validation shape, status codes, i18n strings, metrics) from the business logic in the service layer.

## Key elements

- **`postPasswordChange(request, response)`** — the sole export. An async handler that:
  1. Reads the authenticated user id via `authContextOf`.
  2. Validates the body with the `ChangePasswordBody` Zod schema; rejects early on shape errors.
  3. Calls `accountService.passwordChangeWithCurrent(id, currentPassword, password, passwordConfirm, callerContext)`.
  4. On success, calls `issueSession(response, id)` to mint a fresh token, then returns `200` with `{ token }` and an i18n success message.
  5. On service failure, maps `result.status` / `result.errors` into a `rejectResponse`.
  6. On unexpected (DB) errors, delegates to `rejectDatabaseError`.
  7. Emits `authPasswordChangeTotal` (success / failure) on every path.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure/http/controller.ts` | Imports `rejectValidation` for Zod shape failures. |
| `src/infrastructure/http/errors.ts` | Imports `rejectDatabaseError` for Mongoose / generic error mapping. |
| `src/infrastructure/http/request.ts` | Imports `authContextOf` (user id) and `callerContextOf` (IP / UA for audit). |
| `src/infrastructure/http/response.ts` | Imports `successResponse` and `rejectResponse` for uniform JSON envelopes. |
| `src/infrastructure/i18n/index.ts` (via `context.ts`) | Imports `t` for the localized success message. |
| `src/modules/account/metrics.ts` | Imports `authPasswordChangeTotal` Counter; incremented on every outcome. |
| `src/modules/account/routes.ts` | Registers `postPasswordChange` on the `POST /account/password` route (behind `isAuth`). |
| `src/modules/account/services/index.ts` | Imports `accountService` and calls `.passwordChangeWithCurrent`. |
| `src/modules/account/session/session.ts` | Imports `issueSession` to re-mint the caller's session after the write. |
| `src/types/index.ts` | Imports the `ChangePasswordRequest` type used in the Express `Request` generic. |

## Notes

- **Re-mint failure is swallowed deliberately.** If `issueSession` throws after the password write and session revocation have already committed, the handler still returns `200` with the success message but *without* a token. A `500` here would mislead the client into thinking the password change failed. The caller simply has no new token and must re-authenticate.
- Auth is **not** checked inside this handler; it is guaranteed by the `isAuth` middleware applied in `routes.ts`.
- The service revokes all *other* sessions; this controller is solely responsible for the caller's own token. Forgetting the `issueSession` call would silently sign the user out of the tab they are in.
- Metric labels use `status: 'success' | 'failure'` — there is no separate label for the degraded re-mint path; it still counts as `success`.
