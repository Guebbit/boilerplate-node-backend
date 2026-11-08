---
source: src/modules/tasks/controllers/post-task-doors.ts
sha256: 9ee99c63e5bcdfd97db5126119dce4c6ef79bbcbf2dcfa1c409bea4481c65386
generated_at: 2026-11-08T08:32:14.516815+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/controllers/post-task-doors.ts

## Purpose

Defines the three bodyless "status door" handlers for a single task — `POST /tasks/:id/resolve`, `POST /tasks/:id/mark-spam`, and `POST /tasks/:id/reopen`. Each handler follows an identical shape (extract id → invoke a service method → 200 with the updated task) and is produced by a shared factory so the wiring logic lives in one place.

## Key elements

- **`doorController`** (private factory) — Takes a log-name and a service-call signature (`(typeof taskService)['resolve']`) and returns an Express handler. The handler: validates the `:id` param via `requireId`, calls the service with the caller context, checks for a refusal result, sends `successResponse<Task>(…, 200)`, and funnels errors through `catchAs`.
- **`postTaskResolve`** — `doorController('postTaskResolve', taskService.resolve)`. Exposed for `POST /tasks/:id/resolve` (staff).
- **`postTaskMarkSpam`** — `doorController('postTaskMarkSpam', taskService.markSpam)`. Exposed for `POST /tasks/:id/mark-spam` (staff).
- **`postTaskReopen`** — `doorController('postTaskReopen', taskService.reopen)`. Exposed for `POST /tasks/:id/reopen` (staff).

## Relationships

- **`src/modules/tasks/service.ts`** — Source of the three service methods (`resolve`, `markSpam`, `reopen`) that each door delegates to.
- **`src/modules/tasks/routes.ts`** — Consumes the three exported handlers to register the POST routes.
- **`src/infrastructure/http/controller.ts`** — Provides `catchAs` (error-to-HTTP mapping) and `refused` (detects a service-level refusal so the controller can short-circuit).
- **`src/infrastructure/http/ids.ts`** — Provides `requireId` to pull and validate the `:id` param, returning `undefined` and a 404-style response on failure.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf` to extract the authenticated caller's context for the service call.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse<Task>` to emit the standard 200 JSON envelope.
- **`src/types/index.ts`** — Source of the `Task` type used as the generic parameter of `successResponse`.

## Notes

- All three doors are **bodyless** — no request body is parsed; the only input is the path parameter `:id`.
- The `name` argument to `doorController` is used solely for the log line emitted by `catchAs`; it is not exposed to the client.
- The factory's `run` parameter is typed as `(typeof taskService)['resolve']`, meaning `markSpam` and `reopen` must share that exact signature (`(id, caller) => Promise<Result<Task>>`); adding a service method with a different shape would require a new factory or a widened type.
- A refused result (e.g., "already resolved") is handled via `refused` *before* the success path, so the client receives the service-defined error rather than a 200.
