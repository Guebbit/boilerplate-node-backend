---
source: src/modules/users/controllers/restore-users.ts
sha256: f19ec8339b1b1613036e493842a62a043e79c4ea32697ccaeaeb9bff8b88ab4c
generated_at: 2026-10-29T06:11:55.926585+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/controllers/restore-users.ts

## Purpose

Thin HTTP controller that handles `POST /users/:id/restore`, undoing an admin soft-delete of a user account. It delegates all business logic (restoration, audit emission, serialization) to `userService` and relies on the shared `createRestoreController` factory for request parsing, error handling, and response shaping.

## Key elements

- **`restoreUsers`** (exported const) — The controller object built by `createRestoreController`. Configured with:
  - `entity: 'user'` — identifies the resource type for the factory's internal logic.
  - `restore` — calls `userService.restoreById(id, callerContextOf(request))`; the service owns the `ADMIN_USER_RESTORED` audit emit.
  - `present` — calls `userService.toUserContract(user, callerContextOf(request).caller)` to serialize the restored user into the API contract.
  - `notFoundKey: 'users.not-found'` — i18n key used for the 404 response when the user id doesn't exist.

## Relationships

- **`src/infrastructure/surfaces/create-restore-controller.ts`** — Provides the `createRestoreController` factory. This file supplies the `restore` and `present` callbacks; the factory wires them into a complete HTTP handler (status codes, error wrapping, response envelope).
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf`, used to extract the authenticated caller's identity from the incoming request and pass it to service methods.
- **`src/modules/users/services/index.ts`** — Provides `userService`, which owns `restoreById` (the actual soft-delete undo + audit emit) and `toUserContract` (response serialization).
- **`src/modules/users/routes.ts`** — Imports `restoreUsers` and mounts it on the `POST /users/:id/restore` route.

## Notes

- Returns **409** (not 404 or 400) when the target account is *not* in a deleted state; this is handled inside the `createRestoreController` factory, not in this file.
- The `ADMIN_USER_RESTORED` audit event is emitted inside `userService.restoreById`, so this controller contains no audit logic itself.
- The controller is intentionally stateless and allocation-free beyond the factory call; all domain behavior lives in the service layer.
