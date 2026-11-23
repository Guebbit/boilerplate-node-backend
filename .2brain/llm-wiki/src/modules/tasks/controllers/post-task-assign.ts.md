---
source: src/modules/tasks/controllers/post-task-assign.ts
source_sha256: ba4ba0fb69721b2283515eb35f27687f7f951bdfc6111800bdec20f7664cba59
context_sha256: 9e223216137616c348e55afdcfcb4c12130f09a6da1501c4161524ce8b474fd4
generated_at: 2026-11-22T07:58:10.967471+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/tasks/controllers/post-task-assign.ts

## Purpose
Express controller for `POST /tasks/:id/assign`. It hands a task to one person; "taking" a task is simply assigning it to yourself. The route is staff-only, as stated in the doc comment.

## Key elements
- `postTaskAssign(request, response)`: the only export. It does the following, in order:
  1. Validates the `:id` param with `requireId`, using the not-found message key `generic.error-item-gone`.
  2. Validates the body with `parseBody(AssignTaskBody, ...)`. The body carries a `userId`.
  3. Calls `taskService.assign(id, body.userId, callerContextOf(request))`.
  4. If `refused(response, result)` handles the result, it stops. Otherwise it responds `200` with `successResponse<Task>(response, result.data, 200)`.
  5. Maps any thrown error through `catchAs(response, 'postTaskAssign')`.

## Relationships
- `src/infrastructure/http/ids.ts`: `requireId` extracts and validates the task id.
- `src/infrastructure/http/controller.ts`: supplies `parseBody`, `refused` and `catchAs`, which handle body validation, service-refusal responses and error mapping.
- `src/infrastructure/http/request.ts`: `callerContextOf` builds the caller context passed to the service.
- `src/infrastructure/http/response.ts`: `successResponse` writes the success envelope.
- `src/modules/tasks/services/index.ts`: exports `taskService`, which this handler calls for the assignment.
- `src/types/index.ts`: provides the `AssignTaskRequest` and `Task` types.
- `src/modules/tasks/routes.ts`: mounts this handler on the route (inferred from the neighbor relationship; the route wiring is not visible in this file).

## Notes
- The handler contains no business logic, authorization or assignment rules. It only validates input, delegates to the service and shapes the response.
- When `requireId` or `parseBody` returns a falsy value, the handler returns `Promise.resolve()`. It assumes the helper has already written the error response.
- Both the not-found and the generic error paths rely on helpers writing to `response`. The handler itself never sends an error directly.
- The request body is validated with the `AssignTaskBody` schema imported from `@api/schemas.zod`.
- The staff-only restriction is described in the doc comment but not enforced here, so it is presumably applied at the route level.
