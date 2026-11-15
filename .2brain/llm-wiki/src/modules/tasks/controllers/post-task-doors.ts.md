---
source: src/modules/tasks/controllers/post-task-doors.ts
sha256: 874c887c5ae811c8b97501a003242123a9e14f41d60761e758403df92c09e7cf
generated_at: 2026-11-14T22:06:37.501769+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/controllers/post-task-doors.ts

## Purpose

Defines the three bodyless task-status transition endpoints — `POST /tasks/:id/resolve`, `/mark-spam`, `/reopen` — as thin Express handlers. Each one extracts the task ID from the URL, delegates to the matching `taskService` method, and replies `200` with the updated task. All three are built from a single shared factory so they stay structurally identical.

## Key elements

- **`doorController`** (module-private factory) — Given a log name and a service method with the signature of `taskService.resolve`, returns an Express handler that: reads the `:id` param, calls the service with caller context, sends `200` on success, short-circuits on refusal, and funnels errors through `catchAs`.
- **`postTaskResolve`** — `doorController('postTaskResolve', taskService.resolve)` for `POST /tasks/:id/resolve` (staff).
- **`postTaskMarkSpam`** — `doorController('postTaskMarkSpam', taskService.markSpam)` for `POST /tasks/:id/mark-spam` (staff).
- **`postTaskReopen`** — `doorController('postTaskReopen', taskService.reopen)` for `POST /tasks/:id/reopen` (staff).

## Relationships

- **`src/modules/tasks/services/index.ts`** — imports `taskService`; each exported handler binds one of its methods (`resolve`, `markSpam`, `reopen`).
- **`src/modules/tasks/routes.ts`** — registers the three exported handlers on their respective POST routes.
- **`src/infrastructure/http/ids.ts`** — `requireId` extracts and validates the URL `:id` param; early-returns a 404 if absent.
- **`src/infrastructure/http/request.ts`** — `callerContextOf` pulls authenticated-caller metadata from the Express request.
- **`src/infrastructure/http/response.ts`** — `successResponse<Task>` formats the `200` JSON reply.
- **`src/infrastructure/http/controller.ts`** — `refused` short-circuits policy denials; `catchAs` maps thrown errors to an HTTP error response (and logs with the door name).
- **`src/types/index.ts`** — `Task` type parameterises the success response payload.

## Notes

- All three doors are **bodyless** (no request body is read) and **staff-only** per the JSDoc annotations.
- The `name` argument to `doorController` is used solely for the `catchAs` log line and module-surface documentation; it does not affect routing.
- Adding a new status door requires only one new exported `doorController(…)` line plus the corresponding service method — no new handler boilerplate.
- `requireId` returning `undefined` causes an early `Promise.resolve()` return; the handler never falls through to the service call in that case.
