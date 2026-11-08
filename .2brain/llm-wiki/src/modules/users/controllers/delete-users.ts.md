---
source: src/modules/users/controllers/delete-users.ts
sha256: efc477efb7f27b5aa6a4d0b8d6dbfda14cf083ba41faaf8979e045badc427fa9
generated_at: 2026-11-08T08:43:58.306199+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/controllers/delete-users.ts

## Purpose

Admin-facing controller that handles `DELETE /users/:id` with an optional `?hardDelete=true` query parameter. Soft delete is the default; hard delete permanently removes the user and runs all registered `personalData.erase` hooks in a single transaction. Only the hard path discharges an Art. 17 erasure request.

## Key elements

- **`deleteUsers`** (exported) — The controller instance, built via `createDeleteController`. It maps the `remove` callback to `userService.removeById(id, hardDelete, callerContextOf(request))` and sets `notFoundKey: 'users.not-found'` for the 404 message.
- **`entity: 'user'`** — Declared in the config passed to `createDeleteController`; used by the surface layer for logging/audit naming.
- **`remove` callback** — The only business logic in this file: delegates to `userService.removeById`, forwarding the caller context extracted from the HTTP request.

## Relationships

- **`src/infrastructure/surfaces/create-delete-controller.ts`** — Provides the `createDeleteController` factory that builds the route handler (parameter parsing, `?hardDelete` detection, 404 handling). This file supplies the config object; the factory supplies the HTTP plumbing.
- **`src/infrastructure/http/request.ts`** — Source of `callerContextOf(request)`, which extracts authenticated-actor metadata needed for the audit trail recorded inside `removeById`.
- **`src/modules/users/services/index.ts`** — Re-exports `userService`; this file calls `userService.removeById` for the actual soft/hard deletion logic.
- **`src/modules/users/routes.ts`** — Wires `deleteUsers` onto the `DELETE /users/:id` route (and the `/hard` variant).

## Notes

- The list of `personalData.erase` hooks run during hard delete is intentionally **not** enumerated in this file. It is generated at build/regenerate time and documented in `docs/modules/users.md` (neighbourhood diagram). Adding a new hook elsewhere automatically appears there; naming them here would go stale silently.
- `?hardDelete=true` is the **only** path that satisfies an Art. 17 (GDPR) erasure request. The audit action name recorded by `userService.removeById` distinguishes which variant executed, so the trail itself answers that question later.
- This file contains no route definitions, middleware, or validation — those live in the surface layer and routes file.
