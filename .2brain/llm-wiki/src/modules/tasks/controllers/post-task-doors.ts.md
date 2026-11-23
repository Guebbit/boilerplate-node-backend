---
source: src/modules/tasks/controllers/post-task-doors.ts
source_sha256: 06261993ea857278b07ff3dad07500294d05f777cc6180250a743a44af80906c
context_sha256: 9e223216137616c348e55afdcfcb4c12130f09a6da1501c4161524ce8b474fd4
generated_at: 2026-11-22T07:58:24.899967+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/tasks/controllers/post-task-doors.ts

## Purpose
Defines the three bodyless task status endpoints, `POST /tasks/:id/resolve`, `/mark-spam` and `/reopen`. All three share one handler shape: read the id, call the matching `taskService` method, and answer 200 with the resulting task. The file builds them from a single factory so the behavior stays identical across doors.

## Key elements
- `doorController(name, run)` (internal): returns an Express handler.
  - It calls `requireId` with `notFound: 'generic.error-item-gone'`. If the id is missing or invalid, the handler stops (it returns a resolved promise).
  - Otherwise it calls `run(id, callerContextOf(request))`.
  - If `refused(response, result)` handles the result, it returns without a success response. Otherwise it sends `successResponse<Task>(response, result.data, 200)`.
  - Rejections go to `catchAs(response, name)`. `name` is used for the log line and the module-surface docs.
- `postTaskResolve`: `POST /tasks/:id/resolve` (staff), backed by `taskService.resolve`.
- `postTaskMarkSpam`: `POST /tasks/:id/mark-spam` (staff), backed by `taskService.markSpam`.
- `postTaskReopen`: `POST /tasks/:id/reopen` (staff), backed by `taskService.reopen`.

## Relationships
- `src/modules/tasks/services/index.ts`: provides `taskService`, whose `resolve`, `markSpam` and `reopen` methods are the door implementations. They are passed in by reference.
- `src/infrastructure/http/ids.ts`: `requireId` extracts and validates the `:id` param.
- `src/infrastructure/http/request.ts`: `callerContextOf` builds the caller context passed to the service.
- `src/infrastructure/http/response.ts`: `successResponse` writes the 200 response.
- `src/infrastructure/http/controller.ts`: `refused` short-circuits when the service result is a refusal, and `catchAs` is the error handler.
- `src/types/index.ts`: supplies the `Task` type for the response payload.
- `src/modules/tasks/routes.ts`: the route wiring that consumes these three exports (inferred from the graph; the file itself doesn't show the registration).

## Notes
- The "(staff)" restriction appears only in the doc comments. This file enforces no authorization, so it must be applied elsewhere, presumably in the routes or the service.
- The handlers take no request body.
- The `run` parameter is typed as `taskService['resolve']`, so `markSpam` and `reopen` must share that signature.
- The module header's `@see` points to a lifecycle section in the tasks module documentation.
