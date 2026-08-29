# src/modules/account/controllers/delete-account-request.ts

## Purpose

Express handler for `DELETE /account`. Accepts an authenticated user's account-deletion request and delegates to `accountService.requestAccountDeletion`, which mints a one-time token and sends a confirmation email. The controller itself performs no persistence and never exposes the token.

## Key elements

- **`deleteAccountRequest(request, response)`** — the sole export. Extracts the user's email via `authContextOf`, looks up the user with `userService.findByEmail`, then calls `accountService.requestAccountDeletion(user, callerContextOf(request))`. Returns `200` with the localized `account.delete.email-sent` string on both the user-found and user-not-found paths. A blanket `.catch` returns `500`.

## Relationships

- **`src/modules/account/services/index.ts`** — provides `accountService.requestAccountDeletion`, the actual deletion-request logic (token minting + email dispatch).
- **`src/modules/users/index.ts` / `src/modules/users/service.ts`** — `userService.findByEmail` resolves the email to a user record.
- **`src/infrastructure/http/request.ts`** — `authContextOf` and `callerContextOf` pull auth/caller metadata off the Express request.
- **`src/infrastructure/http/response.ts`** — `successResponse` / `rejectResponse` shape the HTTP reply.
- **`src/infrastructure/i18n/index.ts`** — `t('account.delete.email-sent')` supplies the localized client message.
- **`src/modules/account/metrics.ts`** — `authAccountDeleteTotal` counter, incremented with `{ status: 'success' }` or `{ status: 'failure' }`.
- **`src/modules/account/routes.ts`** — registers this handler on the `DELETE /account` route.
- **`src/modules/account/tests/unit/delete-account.test.ts`** — unit tests for the handler.

## Notes

- **User-not-found still returns 200 + "email sent".** This is intentional (avoids leaking account existence) but the metric is tagged `failure` rather than `success`, which is the only distinguishing signal.
- **Auth is not enforced here.** The JSDoc notes `isAuth` middleware is expected upstream; the handler trusts `authContextOf` will succeed.
- **Token never crosses the controller boundary.** `requestAccountDeletion` mints and emails the token internally; the controller only observes the promise resolving.
- **The `catch` handler swallows all errors** (including service-internal ones) into a uniform `500 []` response — no error message is forwarded to the client.
