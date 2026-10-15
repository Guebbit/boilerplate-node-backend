---
source: src/modules/users/controllers/restore-users.ts
sha256: 17cee68aa082e3b87c546ccd10f358b5fc152765e360786c0213a6d5240f7694
generated_at: 2026-10-15T12:07:18.474883+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/controllers/restore-users.ts

## Purpose

Thin controller that wires the `POST /users/:id/restore` endpoint (admin-only) to the user service. It delegates the actual restore logic and response shaping to `userService`, while relying on the shared `createRestoreController` factory for request validation, 404/409 handling, and audit-emit conventions.

## Key elements

- **`restoreUsers`** (exported const) — The finished controller instance produced by `createRestoreController`. Accepts a `POST /users/:id/restore` request and:
  - Calls `userService.restoreById(id, callerContextOf(request))` to perform the soft-delete undo.
  - Serialises the result via `userService.toUserContract(user, request.caller)`.
  - Returns 409 if the account is not currently in a deleted state; 404 (key `users.not-found`) if the id doesn't exist.

## Relationships

- **`src/infrastructure/surfaces/create-restore-controller.ts`** — Supplies the `createRestoreController` factory that assembles the HTTP handler, status-code logic, and response envelope. This file is a concrete configuration of that factory for the `user` entity.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf`, used to extract the authenticated caller's identity/permissions from the incoming request before passing it to the service.
- **`src/modules/users/services/index.ts`** — Source of `userService`, whose `restoreById` performs the restore + `ADMIN_USER_RESTORED` audit emit, and whose `toUserContract` shapes the response payload.
- **`src/modules/users/routes.ts`** — Registers `restoreUsers` on the router for the `POST /users/:id/restore` path.

## Notes

- The `ADMIN_USER_RESTORED` audit event is emitted inside `userService.restoreById`, **not** in this controller. The controller itself is side-effect-free beyond invoking the service.
- The 409 response (account not deleted) is a convention of the shared `createRestoreController` factory; this file does not explicitly set that status code.
- `callerContextOf` is passed into `restoreById` as a second argument, meaning the service receives caller metadata (e.g. actor id) for audit purposes rather than the raw request object.
