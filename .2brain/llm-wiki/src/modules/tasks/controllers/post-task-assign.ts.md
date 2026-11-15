---
source: src/modules/tasks/controllers/post-task-assign.ts
sha256: 041ae18d542eaffcfff64ab42ddbcd317766d3c574dbad6726c563c608cc077c
generated_at: 2026-11-14T22:06:26.361228+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/controllers/post-task-assign.ts

## Purpose

HTTP controller for the `POST /tasks/:id/assign` endpoint. It validates the task ID and request body, then delegates to `taskService.assign` to hand a task to a specified user (or the caller themselves — "taking" is just self-assignment).

## Key elements

- **`postTaskAssign`** (exported function) — The sole handler. Accepts a typed Express `Request`/`Response`, validates the `:id` param via `requireId`, parses the body against the `AssignTaskBody` Zod schema, calls `taskService.assign(id, body.userId, callerContextOf(request))`, and responds with either a `refused` result, a `200` success envelope, or a caught error via `catchAs`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Source of the shared helpers `catchAs`, `parseBody`, and `refused` used for validation, error handling, and rejection responses.
- **`src/infrastructure/http/ids.ts`** — Provides `requireId`, which extracts and validates the `:id` route parameter.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf`, used to pass the authenticated caller's context into the service call.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` for the standard success envelope.
- **`src/modules/tasks/services/index.ts`** — Exports `taskService`; this controller is its only direct caller for the `assign` method.
- **`src/modules/tasks/routes.ts`** — Registers `postTaskAssign` as the handler for the `POST /tasks/:id/assign` route.
- **`src/types/index.ts`** — Supplies the `AssignTaskRequest` and `Task` types used in the function signature and response.

## Notes

- The endpoint serves dual purpose: assigning a task *to* someone and *taking* a task (assigning to self). No separate "take" route exists.
- Success returns HTTP **200**, not 201, since the task already exists and only ownership changes.
- The not-found error for an invalid `:id` uses the message key `generic.error-item-gone` (not a task-specific key).
- Early returns via `Promise.resolve()` short-circuit the chain when ID or body validation fails, rather than throwing.
