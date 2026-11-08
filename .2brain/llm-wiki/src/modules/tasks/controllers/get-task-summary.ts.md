---
source: src/modules/tasks/controllers/get-task-summary.ts
sha256: 46f6c4a840047f511b9ea1c3241b66c045f497d0ffc6f089817d64b618b67430
generated_at: 2026-11-08T08:31:44.734267+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/controllers/get-task-summary.ts

## Purpose

Thin HTTP controller for `GET /tasks/summary`. It extracts the caller context from the request, delegates to the task service to fetch staff badge counts, and returns them as a 200 JSON response. Exists to separate the Express plumbing from the domain logic in `service.ts`.

## Key elements

- **`getTaskSummary(request, response)`** – Exported Express handler. Calls `taskService.summary(callerContextOf(request))`, sends the result via `successResponse(response, counts, 200)`, and funnels errors through `catchAs(response, 'getTaskSummary')`.

## Relationships

- **`src/infrastructure/http/controller.ts`** – Supplies `catchAs`, the shared error-catch wrapper that serializes failures into a standard HTTP error response.
- **`src/infrastructure/http/request.ts`** – Supplies `callerContextOf`, which extracts the authenticated caller's identity/context from the Express request for service use.
- **`src/infrastructure/http/response.ts`** – Supplies `successResponse`, which wraps a payload into the project's standard success envelope and sets the status code.
- **`src/modules/tasks/service.ts`** – Provides `taskService.summary(ctx)`, the actual business logic that computes the badge counts.
- **`src/modules/tasks/routes.ts`** – Registers `getTaskSummary` as the handler for the `GET /tasks/summary` route (staff-guarded).

## Notes

- The handler is intentionally minimal: no validation, no branching, no state. All logic lives in `taskService.summary`.
- JSDoc links to `docs/modules/tasks.md` for broader module context.
- The endpoint is marked **(staff)**; authorization enforcement is expected to be handled upstream (routes or middleware), not inside this controller.
