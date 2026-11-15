---
source: src/modules/users/controllers/post-user-restore.ts
sha256: 96b807b7ce06f38f041bfa4393818bedb22699135046ea57420bf354c9f16aec
generated_at: 2026-11-14T22:20:53.434909+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/controllers/post-user-restore.ts

## Purpose

Controller for `POST /users/:id/restore`. Undoes an admin soft-delete of a user account, returning the restored user in its standard contract shape. Returns **409** if the account is not currently in a deleted state.

## Key elements

- **`restoreUsers`** (exported) — the route handler, built via `createRestoreController`. Configures:
  - `entity: 'user'`
  - `restore` — delegates to `userService.restoreById(id, callerContext)`
  - `present` — serializes the restored user via `userService.toUserContract(user, caller)`
  - `notFoundKey: 'users.not-found'`
  - `basePath: '/users'`

## Relationships

- **`src/infrastructure/surfaces/create-restore-controller.ts`** — supplies the `createRestoreController` factory that assembles the HTTP handler (status codes, error shape, audit wiring) from the config object passed here.
- **`src/infrastructure/http/request.ts`** — provides `callerContextOf`, used to extract the authenticated caller's context from the incoming request and forward it to the service layer.
- **`src/modules/users/services/index.ts`** — exports `userService`; this controller calls `userService.restoreById` (business logic + `ADMIN_USER_RESTORED` audit emit) and `userService.toUserContract` (domain→DTO mapping) on that service instance.
- **`src/modules/users/routes.ts`** — imports `restoreUsers` and registers it as the handler for the `POST /users/:id/restore` route.

## Notes

- The audit event (`ADMIN_USER_RESTORED`) is emitted inside the service layer, not in this controller. Keep audit logic in the service.
- The 409 "not deleted" guard is handled by the `createRestoreController` factory (or the service), not by an explicit `if` in this file.
- Caller identity is passed through to the service; this controller does no authorization checks itself.
