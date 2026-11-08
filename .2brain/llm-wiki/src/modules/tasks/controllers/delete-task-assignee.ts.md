---
source: src/modules/tasks/controllers/delete-task-assignee.ts
sha256: 9d1977e817c057fdcaf878ad777d3e8c02926fcd5c7b11d86bcf5732c34b1ab6
generated_at: 2026-11-08T08:31:29.543913+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/controllers/delete-task-assignee.ts

## Purpose

Request handler for the `DELETE /tasks/:id/assignee` endpoint. Despite the "delete" in the name, it performs an *unassign* ("give back") of a task — a staff-level action that removes the assignee from an existing task. It validates the route ID, delegates to the task service, and formats the HTTP response.

## Key elements

- **`deleteTaskAssignee`** (exported) — Express handler accepting `Request<{ id: string }>` and `Response`. Flow: validate ID → call `taskService.unassign` → check for refusal → respond with `successResponse<Task>(200)` or catch errors via `catchAs`.

## Relationships

- **`src/modules/tasks/routes.ts`** — registers `deleteTaskAssignee` as the handler for the `DELETE /tasks/:id/assignee` route.
- **`src/modules/tasks/service.ts`** — provides `taskService.unassign(id, callerContext)`, the actual unassign logic.
- **`src/infrastructure/http/ids.ts`** — `requireId` extracts and validates the `:id` route param; returns early with a `404`-style error (`generic.error-item-gone`) if missing.
- **`src/infrastructure/http/request.ts`** — `callerContextOf(request)` derives the authenticated caller's context passed to the service.
- **`src/infrastructure/http/response.ts`** — `successResponse` serialises the resulting `Task` into a `200` JSON body.
- **`src/infrastructure/http/controller.ts`** — `refused` short-circuits on service-level rejections; `catchAs` converts thrown errors into a standard error response.
- **`src/types/index.ts`** — supplies the `Task` type used in the success response generic.

## Notes

- The route verb is `DELETE` and the filename says "delete," but the operation is semantically an *unassign*. The task itself is not removed.
- The success status is `200` (not `204`), and the full `Task` object is returned so the client can see the updated assignee field.
- Early-return on invalid ID uses `Promise.resolve()` rather than a bare `return undefined`, keeping the handler's return type uniformly `Promise<void>`-compatible for Express.
