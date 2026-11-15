---
source: src/modules/tasks/controllers/delete-task.ts
sha256: ba51ace1f1512d099f790af483aababc6d15e11fd412b3c6c90ff57ff29f2b37
generated_at: 2026-11-14T22:05:42.632789+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/controllers/delete-task.ts

## Purpose

Controller for the `DELETE /tasks/:id` endpoint (staff-only). Permanently removes a task by id. It is hand-written rather than produced by the shared `createDeleteController` factory, which is reserved for modules that implement a soft/hard-delete triplet; the tasks module has no soft-delete tier.

## Key elements

- **`deleteTask`** (exported function) — Express handler accepting `Request<{ id: string }>` and `Response`. Validates the `:id` param via `requireId` (404 with a generic "item gone" message if missing), then delegates to `taskService.removeById(id, callerContextOf(request))`. On success sends `204 No Content`; on refusal (e.g. out-of-jurisdiction) short-circuits via `refused`; on thrown error calls `catchAs(response, 'deleteTask')`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — imports `catchAs` (unified error handler) and `refused` (authorization-failure short-circuit).
- **`src/infrastructure/http/ids.ts`** — imports `requireId` to extract and validate the `:id` route parameter.
- **`src/infrastructure/http/request.ts`** — imports `callerContextOf` to derive the authenticated caller's context for the service call.
- **`src/infrastructure/http/response.ts`** — imports `noContentResponse` to emit the `204` success response.
- **`src/modules/tasks/services/index.ts`** — imports `taskService`, whose `removeById` method performs the actual deletion.
- **`src/modules/tasks/routes.ts`** — registers `deleteTask` as the handler for `DELETE /tasks/:id`.

## Notes

- The 404 for a missing/invalid id uses a deliberately generic error key (`'generic.error-item-gone'`) rather than distinguishing "not found" from "not yours," to avoid leaking existence information.
- The module docstring explicitly notes *why* it is hand-written: the `createDeleteController` factory is tied to the soft/hard-delete pattern, which does not apply here.
