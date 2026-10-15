---
source: src/modules/users/controllers/delete-users.ts
sha256: 7eca0d2af063b77ab84298104c50592fc5e483e69fd222d8bc0fb8e5bd21410e
generated_at: 2026-10-15T12:06:50.336235+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/controllers/delete-users.ts

## Purpose

Admin-only controller for `DELETE /users` (id in body) and `DELETE /users/:id` (path param). Supports soft delete by default and permanent hard delete via `?hardDelete=true`. It delegates all deletion logic to `userService` and records the outcome in an audit trail.

## Key elements

- **`deleteUsers`** (exported const) — The single controller export, built via `createDeleteController`. Configures:
  - `entity: 'user'` — identifies the resource type for the generic delete surface.
  - `remove` — callback that calls `userService.removeById(id, hardDelete, callerContextOf(request))`.
  - `notFoundKey: 'users.not-found'` — i18n key returned when the target user does not exist.

## Relationships

- **`src/infrastructure/surfaces/create-delete-controller.ts`** — Provides the generic delete-controller factory that `deleteUsers` is built from. Supplies routing, parameter extraction (body id vs path id), the `?hardDelete` flag, and the not-found response shape.
- **`src/infrastructure/http/request.ts`** — `callerContextOf` extracts the authenticated caller's context from the incoming request, which is passed through to the service for audit and authorisation.
- **`src/modules/users/services/index.ts`** — Exports `userService`; its `removeById` method performs the actual soft or hard delete.
- **`src/modules/users/routes.ts`** — Imports `deleteUsers` and mounts it on the `DELETE /users` and `DELETE /users/:id` routes.

## Notes

- Hard delete (`?hardDelete=true`) is the **only** path that discharges a GDPR Art. 17 erasure obligation. The audit action recorded by `userService.removeById` names which mode ran, so the trail itself is the source of truth for compliance questions.
- Hard delete executes every registered `personalData.erase` hook within a single transaction. The doc comment deliberately does **not** enumerate the hooks — they change on regeneration and are documented in the neighbourhood diagram in `docs/modules/users.md` instead.
- The two URL shapes (id-in-body vs id-in-path) both funnel into the same `remove` callback; the distinction is handled entirely by `createDeleteController`.
