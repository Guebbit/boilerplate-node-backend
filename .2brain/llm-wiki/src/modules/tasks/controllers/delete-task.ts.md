---
source: src/modules/tasks/controllers/delete-task.ts
generated_at: 2026-11-22T07:57:27.180491+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/tasks/controllers/delete-task.ts

## Purpose
Express controller for `DELETE /tasks/:id` (staff, `delete:Task`). It permanently deletes a task. It is written by hand instead of using `createDeleteController`, because that factory serves the soft/hard delete triplet and the tasks module has no soft-delete tier.

## Key elements
- `deleteTask(request, response)`: the only export. It does the following:
  1. Validates the `:id` param with `requireId`, passing `notFound: 'generic.error-item-gone'`. If the id is invalid, `requireId` has already answered, so the controller returns `Promise.resolve()`.
  2. Calls `taskService.removeById(id, callerContextOf(request))`.
  3. If `refused(response, result)` returns true, it stops, since the refusal has already been written to the response. Otherwise it sends `noContentResponse` (204).
  4. Any thrown error goes to `catchAs(response, 'deleteTask')`.

## Relationships
- `src/infrastructure/http/ids.ts`: `requireId` parses and validates the route id and writes the 404 itself.
- `src/infrastructure/http/request.ts`: `callerContextOf` builds the caller context passed to the service.
- `src/infrastructure/http/response.ts`: `noContentResponse` sends the success reply.
- `src/infrastructure/http/controller.ts`: `refused` handles a service refusal result, and `catchAs` is the error handler labelled `'deleteTask'`.
- `src/modules/tasks/services/index.ts`: exports `taskService`, which this controller calls to do the deletion.
- `src/modules/tasks/routes.ts`: the route that binds this handler to `DELETE /tasks/:id`. That binding is not shown in this file.

## Notes
- A malformed, unknown or out-of-jurisdiction id all answer 404. Per the doc comment, this is the only not-found response.
- The deletion is permanent, with no soft-delete step.
- The handler always returns a Promise, and the early-exit path returns a resolved one.
- The module doc comment points to `docs/modules/tasks.md#the-story` for further background.
