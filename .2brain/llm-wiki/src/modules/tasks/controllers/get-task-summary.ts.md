---
source: src/modules/tasks/controllers/get-task-summary.ts
source_sha256: 5e149f7cf275187b96ed2adb160d6649ba17ef4204d6f3370203c80b093dcd68
context_sha256: aebd843c20d16dcc0414d054d2c76c6ac57acc33cc7db7b6125ed43d3a395940
generated_at: 2026-11-22T07:57:36.130520+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/tasks/controllers/get-task-summary.ts

## Purpose
Express controller for `GET /tasks/summary`, which returns the counts shown on the staff badge. It delegates to the task service and wraps the result in a standard HTTP success response. Further documentation is referenced in the file's `@see` tag at `src/modules/tasks/model.ts`.

## Key elements
- `getTaskSummary(request, response)`: the only export. It calls `taskService.summary(callerContextOf(request))`. On success it responds with `successResponse(response, counts, 200)`. On rejection it hands the error to `catchAs(response, 'getTaskSummary')`.

## Relationships
- `src/infrastructure/http/request.ts`: provides `callerContextOf`, which builds the caller context from the Express request and is passed to the service.
- `src/infrastructure/http/response.ts`: provides `successResponse`, which sends the counts with status 200.
- `src/infrastructure/http/controller.ts`: provides `catchAs`, the error handler. It is tagged with the name `'getTaskSummary'`.
- `src/modules/tasks/services/index.ts`: exports `taskService`, whose `summary` method produces the counts.
- `src/modules/tasks/routes.ts`: the route file for the tasks module. It presumably binds this handler to `GET /tasks/summary`. The controller's own doc comment marks the route as staff-only.

## Notes
- The handler uses a promise chain (`.then`/`.catch`) rather than `async`/`await`.
- The controller contains no authorization logic. The `(staff)` restriction is noted only in a comment, so enforcement must happen elsewhere, such as in the route or service.
- The controller does not inspect the shape of `counts`. That is defined by `taskService.summary`.
