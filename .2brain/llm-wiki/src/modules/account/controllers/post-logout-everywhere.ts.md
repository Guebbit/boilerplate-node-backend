---
source: src/modules/account/controllers/post-logout-everywhere.ts
sha256: 7a863d9dbbbe3d7e10ef6d580284a4fb8f5dbe013d3cc337f7bd69b55b91ee4f
generated_at: 2026-10-29T02:30:46.237609+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-logout-everywhere.ts

## Purpose

Thin HTTP adapter that wires the `DELETE /account/sessions` route to `accountService.logoutEverywhere`. It delegates all business logic to the service layer and only handles request extraction, response formatting, and cookie teardown.

## Key elements

- **`postLogoutEverywhere(request, response)`** — The sole export. Extracts the user id from `request.authContext` and the caller context via `callerContextOf(request)`, then calls `accountService.logoutEverywhere`. On success it destroys the session cookie and returns **204 No Content**; on partial/failed revocation it returns the service's error status and body.

## Relationships

- **`src/modules/account/services/index.ts`** — Imports `accountService`; the controller is a thin wrapper around its `logoutEverywhere` method.
- **`src/modules/account/session/cookies.ts`** — Imports `destroySessionCookie` to clear the refresh/session cookie after a successful revocation.
- **`src/infrastructure/http/request.ts`** — Imports `callerContextOf` to pull client metadata (IP, UA, etc.) out of the Express request for auditing/logging.
- **`src/infrastructure/http/response.ts`** — Imports `rejectResponse` (error path) and `noContentResponse` (success path) to keep response construction consistent across controllers.
- **`src/infrastructure/http/controller.ts`** — Imports `catchAs` for uniform async error handling and structured error logging.
- **`src/modules/account/routes.ts`** — Consumes this controller and mounts it on the `DELETE /account/sessions` route (presumably behind an auth middleware that populates `request.authContext`).

## Notes

- **Naming vs. HTTP verb:** The file and function use the "post" prefix, but the actual HTTP method is **DELETE**. The "post" is a project naming convention for controllers, not a verb indicator.
- **Caller is signed out too:** The endpoint intentionally does *not* issue a new session. The doc comment states "no re-mint here."
- **Fail-closed on partial revocation:** If `result.success` is false, the controller returns an error response instead of 204, preventing the client from believing all devices were revoked when some tokens may still be valid.
- **`request.authContext!`** — Uses a non-null assertion, meaning this controller assumes an upstream auth middleware has already attached and validated `authContext`. Calling it without that guard would throw at runtime.
