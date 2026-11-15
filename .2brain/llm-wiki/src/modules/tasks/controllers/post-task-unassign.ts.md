---
source: src/modules/tasks/controllers/post-task-unassign.ts
sha256: e3c5b47bbb90ddc9e841bd25419878ae21780a18162a6d21e9a7f51cebbcd61e
generated_at: 2026-11-14T22:07:15.997566+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/controllers/post-task-unassign.ts

## Purpose

HTTP controller for the `POST /tasks/:id/unassign` endpoint. It validates the path parameter, delegates the "give back" operation to the task service with caller context, and serializes the result or error into an Express response.

## Key elements

- **`postTaskUnassign`** (exported function) — The sole handler. Extracts and validates the task `id`, calls `taskService.unassign(id, callerContextOf(request))`, then either short-circuits via `refused` (e.g. permission/authorization denial) or sends a `200` `successResponse<Task>`. Errors are funneled through `catchAs`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Imports `catchAs` (standard error-to-HTTP mapping) and `refused` (short-circuits when the service signals a refusal instead of a hard error).
- **`src/infrastructure/http/ids.ts`** — Imports `requireId` to validate the task id path parameter; on failure the controller returns early with an error response.
- **`src/infrastructure/http/request.ts`** — Imports `callerContextOf` to derive the authenticated caller's identity/context passed into the service call.
- **`src/infrastructure/http/response.ts`** — Imports `successResponse<Task>` to shape the `200` body.
- **`src/modules/tasks/services/index.ts`** — Imports `taskService`; calls its `unassign` method with the id and caller context.
- **`src/modules/tasks/routes.ts`** — Registers this handler on the `POST /tasks/:id/unassign` route (neighbor via the dependency graph; the actual wiring is in that file).
- **`src/types/index.ts`** — Imports the `Task` type used to type the success response payload.

## Notes

- Success returns **HTTP 200** with the full `Task` body, not `204 No Content` — clients can inspect the updated task (assignee cleared) in the response.
- `refused` is checked *before* `successResponse`; it handles service-level "soft" rejections (e.g. not the assignee) as a distinct path from thrown errors.
- When `requireId` fails the handler returns `Promise.resolve()` (void) rather than calling `next()`, so the Express pipeline simply ends.
- The `catchAs` label `'postTaskUnassign'` is used for logging/correlation, not for the HTTP status.
