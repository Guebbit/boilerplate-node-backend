---
source: src/modules/users/controllers/post-user-restore.ts
sha256: f19ec8339b1b1613036e493842a62a043e79c4ea32697ccaeaeb9bff8b88ab4c
generated_at: 2026-11-08T08:44:38.133780+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/controllers/post-user-restore.ts

## Purpose

Thin HTTP controller for `POST /users/:id/restore`, which undoes an admin soft delete of a user account. It delegates all domain logic to the user service and returns a 409 if the account is not in a deleted state.

## Key elements

- **`restoreUsers`** (exported) — The controller instance built by `createRestoreController`. Configures:
  - `entity: 'user'` — identifies the resource type for the generic restore machinery.
  - `restore(id, request)` — calls `userService.restoreById(id, callerContextOf(request))`; the service owns the `ADMIN_USER_RESTORED` audit emit.
  - `present(user, request)` — serializes the restored user via `userService.toUserContract(user, caller)`, passing the caller identity for permission-aware field shaping.
  - `notFoundKey: 'users.not-found'` — i18n key used for the 404 response.

## Relationships

- **`src/infrastructure/surfaces/create-restore-controller.ts`** — Provides the `createRestoreController` factory. This file supplies the entity-specific callbacks (`restore`, `present`) and receives a ready-to-mount route handler in return.
- **`src/infrastructure/http/request.ts`** — Source of `callerContextOf`, used to extract the authenticated caller's identity from the incoming request for both the restore call and the serialization step.
- **`src/modules/users/services/index.ts`** — Source of `userService`, which implements `restoreById` (domain logic + audit) and `toUserContract` (DTO mapping).
- **`src/modules/users/routes.ts`** — Consumes the exported `restoreUsers` handler and mounts it at the `POST /users/:id/restore` route.

## Notes

- This file contains no business logic or validation beyond what `createRestoreController` provides generically. All domain rules (e.g., "account must be deleted", audit emission) live in `userService.restoreById`.
- The `present` callback receives the *caller's* identity, meaning the serialized response may differ depending on who is performing the restore (e.g., an admin sees different fields than a self-service restore would).
- The 409-on-not-deleted behavior is implied by the module JSDoc; the actual check is enforced inside `userService.restoreById`.
