# src/modules/account/controllers/post-password-change.ts

## Purpose

Controller for `POST /account/password`. Changes the authenticated user's password by requiring the current password as proof of credential possession — no email token or round-trip. Delegates the actual mutation to the account service and reports the outcome via i18n'd HTTP responses and a Prometheus counter.

## Key elements

- **`postPasswordChange(request, response)`** — the sole export. Extracts the user id from auth context, validates the body with the `ChangePasswordBody` zod schema, calls `accountService.passwordChangeWithCurrent`, then maps the result (or error) to an HTTP response and a metric increment.
- **`ChangePasswordBody`** (from `@api/schemas.zod`) — zod schema; `safeParse` gates the request before any service call. Expects `currentPassword`, `password`, and `passwordConfirm`.
- **`authPasswordChangeTotal`** (from `../metrics`) — Prometheus counter, labeled `{ status: 'success' | 'failure' }`, incremented on every code path (validation failure, service failure, success, uncaught error).
- **`authContextOf` / `callerContextOf`** (from `@infrastructure/http/request`) — pull the authenticated user id and caller metadata out of the Express request.

## Relationships

- **`src/modules/account/services/index.ts`** — the controller's only business-logic dependency; calls `accountService.passwordChangeWithCurrent`.
- **`src/modules/account/routes.ts`** — registers this handler on the `POST /account/password` route (behind `isAuth` middleware).
- **`src/infrastructure/http/response.ts`** — provides `successResponse` and `rejectResponse` for shaping the HTTP reply.
- **`src/infrastructure/http/errors.ts`** — provides `rejectDatabaseError` for the `.catch` path (Mongoose `CastError` or generic `Error`).
- **`src/infrastructure/http/controller.ts`** — provides `rejectValidation` for zod parse failures.
- **`src/infrastructure/http/request.ts`** — provides `authContextOf` and `callerContextOf` accessors.
- **`src/infrastructure/i18n/index.ts`** — provides the `t()` function used for the success message key `account.password-change.success`.
- **`src/types/index.ts`** — supplies the `ChangePasswordRequest` generic type used in the Express `Request` signature.

## Notes

- Authentication is **not** checked here; it is guaranteed by the `isAuth` middleware applied in `routes.ts`. Do not add a redundant auth check in this file.
- Other active sessions are **intentionally not revoked** by a password change. Session revocation belongs to `logout-all` or the sessions endpoints. This is a contract decision, not an oversight.
- Validation uses `safeParse` (non-throwing). A missing/malformed field is treated as a *malformed request* (400-range), distinct from a wrong current password (service-level failure).
- The `passwordConfirm` value is passed through to the service; the comparison logic lives there, not in the controller.
- The `.catch` handler types the error as `CastError | Error`; any unhandled rejection from the service will land in `rejectDatabaseError`, which formats a generic 500.
