---
source: src/modules/users/controllers/delete-user-two-factor.ts
sha256: e4fdf7eece7cf94b72431ba80b54516f7cfd708188deacba6e37ec857a35daed
generated_at: 2026-09-23T19:31:46.835978+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/controllers/delete-user-two-factor.ts

## Purpose

HTTP controller for `DELETE /users/:id/2fa`, an admin-only endpoint that strips a user's second factor of authentication without requiring the 2FA code. It is a thin adapter that delegates all business logic to `userService.adminDisableTwoFactor` and translates the result into an HTTP response.

## Key elements

- **`deleteUserTwoFactor`** *(exported function)* — Express request handler. Reads `id` from `request.params`, calls `userService.adminDisableTwoFactor(id, callerContextOf(request))`, then maps the outcome:
  - Failure (`result.success === false`) → `rejectResponse` with the service-provided status and error list.
  - Success → `successResponse` with **200**, no body data, and the i18n message `users.two-factor-disabled`.
  - Uncaught error (typically DB-level) → `rejectDatabaseError`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/users/service.ts` | Calls `userService.adminDisableTwoFactor`; all authz, audit, and DB logic live there. |
| `src/modules/users/routes.ts` | Mounts this handler at `DELETE /users/:id/2fa` and enforces the admin-only gate *before* this function runs. |
| `src/infrastructure/http/response.ts` | Imports `successResponse` / `rejectResponse` to shape the HTTP reply. |
| `src/infrastructure/http/errors.ts` | Imports `rejectDatabaseError` for the `.catch` fallback. |
| `src/infrastructure/http/request.ts` | Imports `callerContextOf` to extract the authenticated admin's identity for the service call. |
| `src/infrastructure/i18n/index.ts` | Imports `t` for the localized success message. |
| `src/infrastructure/i18n/context.ts` | Underlying locale context consumed by `t`. |

## Notes

- **No 2FA code is requested.** Unlike the self-service `DELETE /account/2fa` path or the login challenge flow, this endpoint is an explicit, intentional bypass of "prove the factor to remove it." The controller performs no authorization itself; the router's gate is the sole access control.
- **Returns 200, not 204.** The success response carries an i18n body string (`users.two-factor-disabled`) rather than an empty body.
- **Auditing is the service's job.** The docblock states "every outcome is audited by the service," so this controller does not log or track the action.
- **Error handling is two-tiered:** service-level domain failures (`result.success === false`) are handled inline; unexpected/DB errors fall through to `rejectDatabaseError` in `.catch`.
