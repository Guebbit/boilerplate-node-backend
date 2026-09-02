# src/modules/users/controllers/delete-user-two-factor.ts

## Purpose

Thin HTTP adapter for the `DELETE /users/:id/2fa` admin endpoint. It extracts the target user's id from the URL, delegates to `userService.adminDisableTwoFactor`, and maps the service result to an HTTP response. Its existence is to provide an admin-assisted 2FA removal path that deliberately bypasses the "prove the factor to remove it" requirement of the self-service and login-challenge flows.

## Key elements

- **`deleteUserTwoFactor`** (default export) — Express handler that takes `(Request<{ id: string }>, Response)`. Calls `userService.adminDisableTwoFactor(id, callerContextOf(request))`, returns `200` with the i18n string `users.two-factor-disabled` on success, delegates to `rejectResponse` on service-level failure, and funnels unexpected errors through `rejectDatabaseError`.

## Relationships

- **`src/modules/users/routes.ts`** — registers this handler under `DELETE /users/:id/2fa` and enforces the admin-only gate; the controller itself contains no auth logic.
- **`src/modules/users/service.ts`** — sole business-logic dependency; `adminDisableTwoFactor` performs the actual 2FA strip and audit logging.
- **`src/infrastructure/http/response.ts`** — provides `successResponse` / `rejectResponse` for shaping the HTTP reply.
- **`src/infrastructure/http/errors.ts`** — provides `rejectDatabaseError` to normalise `CastError` / unknown exceptions into a consistent error envelope.
- **`src/infrastructure/http/request.ts`** — provides `callerContextOf` to capture the acting admin's identity for the service call.
- **`src/infrastructure/i18n/index.ts`** — provides the `t` function used to translate the success message (`users.two-factor-disabled`).

## Notes

- This endpoint is the *one* sanctioned way to remove a second factor without presenting a code; the service layer is expected to audit every outcome.
- The controller intentionally carries no validation of the `id` param beyond passing it through — mongoose `CastError` handling in the `.catch` is the safety net for malformed ids.
- Do not conflate with the self-service path (`DELETE /account/2fa`) or the login challenge; they live elsewhere and require the user to prove possession of the factor.
