---
source: src/modules/tasks/controllers/post-task-unassign.ts
source_sha256: b2bf373330f197a4ae6967f22042f7cf3728ddf380578b7c48497ccb5916e0ce
context_sha256: 9e223216137616c348e55afdcfcb4c12130f09a6da1501c4161524ce8b474fd4
generated_at: 2026-11-22T07:58:46.956549+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/tasks/controllers/post-task-unassign.ts

## Purpose
Express controller for `POST /tasks/:id/unassign` (staff-only, per its doc comment). It lets a caller give a task back by delegating to the task service and returning the updated task.

## Key elements
- `postTaskUnassign(request, response)` — the only export. It:
  1. Validates the `:id` param with `requireId`, using the not-found message key `generic.error-item-gone`. If no valid id is returned, it resolves immediately without doing anything else.
  2. Calls `taskService.unassign(id, callerContextOf(request))`.
  3. If `refused(response, result)` reports a refusal, it returns without sending a success response.
  4. Otherwise it sends `successResponse<Task>(response, result.data, 200)`.
  5. Any thrown error goes to `catchAs(response, 'postTaskUnassign')`.

## Relationships
- `src/infrastructure/http/ids.ts` — `requireId` parses and validates the route id.
- `src/infrastructure/http/request.ts` — `callerContextOf` builds the caller context passed to the service.
- `src/infrastructure/http/response.ts` — `successResponse` formats the 200 response.
- `src/infrastructure/http/controller.ts` — `refused` handles service refusals, and `catchAs` handles errors.
- `src/modules/tasks/services/index.ts` — supplies `taskService`, which holds the unassign logic.
- `src/types/index.ts` — supplies the `Task` type, imported as `@types`.
- `src/modules/tasks/routes.ts` — the route registration that wires this handler to the endpoint.

## Notes
- The controller contains no business logic. Authorization and the unassign rules live in the service, and the controller only reacts to the service's refusal result.
- It returns a promise chain rather than using `async/await`. The early-exit branch returns `Promise.resolve()` so the return type stays consistent.
