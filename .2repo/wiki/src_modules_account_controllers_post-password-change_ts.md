# src/modules/account/controllers/post-password-change.ts

## Purpose

Thin HTTP adapter for `POST /account/password`. Validates the request body, delegates to the account service's `passwordChangeWithCurrent` method (which requires the current password as proof), and maps the service result onto a standardized HTTP response. Exists so the route layer stays declarative while business logic lives in the service.

## Key elements

- **`postPasswordChange`** (exported function) — Express handler. Extracts the authenticated user ID from the auth context, Zod-validates the body via `ChangePasswordBody.safeParse`, calls `accountService.passwordChangeWithCurrent`, and emits a success/failure response. Tracks outcomes with the `authPasswordChangeTotal` Prometheus counter.

## Relationships

- **`src/infrastructure/http/controller.ts`** — uses `rejectValidation` to short-circuit on Zod parse failure.
- **`src/infrastructure/http/errors.ts`** — uses `rejectDatabaseError` in the `.catch` path for Mongoose `CastError` / generic errors.
- **`src/infrastructure/http/request.ts`** — calls `authContextOf` to read the authenticated user ID (set upstream by `isAuth` middleware) and `callerContextOf` to pass through IP/locale metadata.
- **`src/infrastructure/http/response.ts`** — calls `successResponse` / `rejectResponse` to shape the final JSON payload.
- **`src/infrastructure/i18n/index.ts`** — calls `t('account.password-change.success')` for the localized success message.
- **`src/modules/account/metrics.ts`** — increments `authPasswordChangeTotal` with `status: 'success' | 'failure'` on every code path.
- **`src/modules/account/services/index.ts`** — calls `accountService.passwordChangeWithCurrent(id, currentPassword, password, passwordConfirm, callerCtx)`.
- **`src/modules/account/routes.ts`** — registers this handler as the `POST /account/password` route (this file is imported *by* routes, not the reverse).
- **`src/types/index.ts`** — imports the `ChangePasswordRequest` generic type used to type `request.body`.

## Notes

- Validation is split: **shape** errors (missing fields, wrong types) are caught by Zod *before* the service call and reported as a 400 via `rejectValidation`. **Semantic** errors (wrong current password) are returned by the service as `result.success === false` and surfaced through `rejectResponse`. These are distinct failure modes intentionally.
- The comment in the source explicitly notes that this endpoint does **not** revoke other sessions — that is the separate `logout-all` endpoint's responsibility.
- The handler is async-void (returns a promise chain, not `async/await`), so Express will not catch rejections from the `.then` callback; the `.catch` at the end is the sole error boundary.
- The `id` from `authContextOf` is trusted unconditionally; the `isAuth` middleware is the only gate.
