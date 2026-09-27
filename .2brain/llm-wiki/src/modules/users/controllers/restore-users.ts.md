---
source: src/modules/users/controllers/restore-users.ts
sha256: fd986aa30d73998490191189c08e4d5e8492dee52644df3f0658dd526c1d6bf2
generated_at: 2026-09-27T15:36:48.166067+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/controllers/restore-users.ts

## Purpose

Thin controller for `POST /users/:id/restore` that undoes an admin soft-delete of a user. It exists to keep the route layer declarative while delegating business logic to the users service and reusing the shared restore-controller factory.

## Key elements

- **`restoreUsers`** (exported const) — The HTTP handler. Built via `createRestoreController` with:
  - `restore` → calls `userService.restoreById(id)` to clear the soft-delete flag.
  - `present` → calls `userService.toUserContract(user)` to shape the response body.
  - `auditAction` → `usersAuditActions.ADMIN_USER_RESTORED`, passed to the audit pipeline.
  - `notFoundKey` → `'users.not-found'` (i18n key for the 404 body).
  - `entity: 'user'` — singular identifier used by the factory (likely for logging/error messages).

## Relationships

- **`src/infrastructure/surfaces/create-restore-controller.ts`** — Supplies the `createRestoreController` factory that wires up the handler, response shaping, audit emission, and error handling. This file is the sole consumer of that factory for the users module.
- **`src/modules/users/service.ts`** — Provides `userService.restoreById` (the actual DB restore) and `userService.toUserContract` (entity → API DTO mapping).
- **`src/modules/users/audit.ts`** — Provides the `usersAuditActions.ADMIN_USER_RESTORED` enum member used as the audit action tag.
- **`src/modules/users/routes.ts`** — Registers `restoreUsers` on the `POST /users/:id/restore` route (admin-gated).

## Notes

- Returns **409** (not 404) when the target user exists but is *not* currently soft-deleted; 404 (with the `users.not-found` key) only when the id doesn't match any record.
- The handler is a pure composition of the factory + service methods; there is no direct `req`/`res` handling in this file.
- The controller is admin-scoped (per the doc comment); auth/role checks live in the route or middleware, not here.
