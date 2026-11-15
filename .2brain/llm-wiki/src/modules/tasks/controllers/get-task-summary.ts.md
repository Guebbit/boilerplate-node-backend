---
source: src/modules/tasks/controllers/get-task-summary.ts
sha256: 6f3d58f66fbb76c309f1ae8c49114a4bfdebe8986929c6ce95e0f2802918b589
generated_at: 2026-11-14T22:05:48.898144+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/controllers/get-task-summary.ts

## Purpose

Thin HTTP controller for the `GET /tasks/summary` endpoint, which returns aggregate task counts for the staff badge. It extracts the caller context, delegates to the task service, and formats the JSON response.

## Key elements

- **`getTaskSummary(request, response)`** — The sole export. An Express handler that calls `taskService.summary(callerContextOf(request))`, sends a `200` success response with the returned counts object, and routes any thrown error through `catchAs`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Imports `catchAs`, the shared error-handler factory used in the `.catch` chain.
- **`src/infrastructure/http/request.ts`** — Imports `callerContextOf` to derive the authenticated caller's context from the raw Express request.
- **`src/infrastructure/http/response.ts`** — Imports `successResponse` to build the standard `{ data }` JSON envelope.
- **`src/modules/tasks/routes.ts`** — Registers `getTaskSummary` as the handler for the `GET /tasks/summary` route (with staff-level auth).
- **`src/modules/tasks/services/index.ts`** — Imports `taskService`; the controller calls its `summary()` method.

## Notes

- The handler is a single-expression arrow function (no explicit `return`); it returns the promise chain from `taskService.summary(...)`.
- Error handling is delegated entirely to `catchAs(response, 'getTaskSummary')` — no local try/catch or status-code logic in this file.
- The `counts` payload shape is defined by `taskService.summary()`, not by this controller; the controller is purely a pass-through.
