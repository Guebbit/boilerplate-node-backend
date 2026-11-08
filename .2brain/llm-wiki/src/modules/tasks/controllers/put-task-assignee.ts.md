---
source: src/modules/tasks/controllers/put-task-assignee.ts
sha256: c56715d246a13b852a6e660d643d4b18c05b2a9d60f4c86e940c93bdfcdea41c
generated_at: 2026-11-08T08:32:46.033401+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/controllers/put-task-assignee.ts

## Purpose

Controller handler for `PUT /tasks/:id/assignee`. Accepts a task ID (URL param) and a target user ID (body), validates both, and delegates to the task service to reassign the task to that user. Handles the "take" case implicitly — assigning oneself is the same operation.

## Key elements

- **`putTaskAssignee`** (exported) — The Express handler. Validates the URL `:id` via `requireId`, parses the body against the `AssignTaskBody` Zod schema, then calls `taskService.assign(id, body.userId, callerContext)`. Responds `200` with the updated `Task` on success, or delegates to `refused`/`catchAs` for domain rejections and errors.

## Relationships

- **`src/modules/tasks/routes.ts`** — Wires this function as the handler for the `PUT /tasks/:id/assignee` route.
- **`src/modules/tasks/service.ts`** — `taskService.assign()` performs the actual assignment logic; this file only orchestrates request validation and response formatting.
- **`src/infrastructure/http/controller.ts`** — Supplies `parseBody` (Zod validation + error response), `refused` (domain-refusal check), and `catchAs` (error boundary with a caller tag).
- **`src/infrastructure/http/ids.ts`** — `requireId` extracts and validates the `:id` param, returning `null` (and writing a 404) if missing or invalid.
- **`src/infrastructure/http/request.ts`** — `callerContextOf` pulls authenticated caller metadata from the request for the service layer.
- **`src/infrastructure/http/response.ts`** — `successResponse` serialises the result into the standard success envelope.
- **`src/types/index.ts`** — Provides the `AssignTaskRequest` (body shape) and `Task` (response data) types.

## Notes

- The URL `:id` is the **task** id; the assignee is the `body.userId` in the request body, not a path param.
- Returns HTTP **200**, not 204 — the updated task object is included in the response body.
- The service can "refuse" (e.g. permission or state conflict); `refused()` handles that path before the generic `catchAs` error boundary, so callers see a distinct refusal response rather than a 500.
- Body validation uses a **Zod** schema (`AssignTaskBody` from `@api/schemas.zod`), not a hand-written check — update the schema if the accepted fields change.
- Module JSDoc points to `docs/modules/tasks.md` for broader module context.
