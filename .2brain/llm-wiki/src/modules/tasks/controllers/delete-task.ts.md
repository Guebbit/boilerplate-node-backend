---
source: src/modules/tasks/controllers/delete-task.ts
sha256: 028e49412e873fe2f5d75c4ab913658e9987e1ea7fc2abc61a4aeca11a2ceecb
generated_at: 2026-11-08T08:31:38.427003+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/controllers/delete-task.ts

## Purpose

Express controller for `DELETE /tasks/:id` that permanently removes a task. It is hand-written (rather than produced by `createDeleteController`) because the tasks module has no soft-delete tier, making the factory's soft/hard triplet inapplicable.

## Key elements

- **`deleteTask(request, response)`** (exported) — The sole export. Validates the route `:id` param via `requireId`, calls `taskService.removeById(id, callerContext)` and maps the outcome: `refused` → appropriate error, success → `204 No Content`. All rejections funnel through `catchAs(response, 'deleteTask')`.

## Relationships

- **`src/infrastructure/http/ids.ts`** — `requireId` validates and extracts the `:id` param; returns `undefined` (and writes a 404) when the id is malformed, unknown, or out-of-jurisdiction.
- **`src/infrastructure/http/request.ts`** — `callerContextOf` pulls the authenticated caller context off the Express request and passes it into the service call.
- **`src/infrastructure/http/controller.ts`** — `refused` inspects the service result and short-circuits with an error response; `catchAs` converts thrown errors into a standardized error response.
- **`src/infrastructure/http/response.ts`** — `noContentResponse` sends the `204` on successful deletion.
- **`src/modules/tasks/service.ts`** — `taskService.removeById(id, callerContext)` performs the actual deletion and returns a result object that may indicate refusal.
- **`src/modules/tasks/routes.ts`** — Registers this handler for the `DELETE /tasks/:id` route (staff role).

## Notes

- An invalid, unknown, or out-of-jurisdiction id yields **404** (not 400 or 403) via the `notFound: 'generic.error-item-gone'` message key in `requireId`.
- When `requireId` fails the handler returns `Promise.resolve()` early; no service call is made.
- The module docstring explicitly flags that this is *not* a product of `createDeleteController`; do not refactor it into that factory without removing the soft-delete assumption.
