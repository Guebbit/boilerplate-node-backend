---
source: src/modules/example/controllers/post-example-event.ts
source_sha256: b3dbcf0e916a81030757aa0eef0162377bd372763cf01359345e9641d8abd94c
context_sha256: a3536314569273b4b022ad6da71047637e87b85d94537708498b0685f625c1d1
generated_at: 2026-11-22T05:07:35.298739+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/controllers/post-example-event.ts

## Purpose
Thin HTTP controllers for the three example lifecycle "action doors": `POST /examples/:id/publish`, `/archive` and `/unarchive`. Each validates the id, calls the matching service function, and answers. The business rule itself lives in the service. Because the three differ only in the service function, one factory builds all of them.

## Key elements
- `EventDoor` (type, internal): signature of a service function, `(id, context: CallerContext)`, returning the same type as `exampleService.publishById`.
- `eventHandler(operation, door)` (internal factory): wraps an Express handler with `namedHandler(operation, ...)` so logs and metrics carry the handler name. The handler:
  1. Calls `requireId(request, response, { notFound: 'example.not-found' })` and stops if no id is returned.
  2. Calls `door(id, callerContextOf(request))`.
  3. If `refused(response, result)` is true, returns, since the response is already handled.
  4. Otherwise calls `answerAsResource(response, result.data, `/examples/${id}`)`, then `successResponse(response, result.data, 200)`.
  5. Maps any rejection through `.catch(catchAs(response, operation))`.
- `postExamplePublish` (export): uses `exampleService.publishById`. Publishes a draft the caller may edit.
- `postExampleArchive` (export): uses `exampleService.archiveById`. Archives a draft or published example the caller may edit.
- `postExampleUnarchive` (export): uses `exampleService.unarchiveById`. Returns an archived example the caller may edit to draft.

## Relationships
- `src/infrastructure/http/controller.ts`: supplies `namedHandler`, `catchAs` and `refused`, which give the handler its naming, error mapping and refusal handling.
- `src/infrastructure/http/ids.ts`: `requireId` extracts and validates the `:id` param on the request.
- `src/infrastructure/http/request.ts`: `callerContextOf` builds the `CallerContext` passed to the service.
- `src/infrastructure/http/response.ts`: `successResponse` sends the 200 reply.
- `src/infrastructure/http/preconditions.ts`: `answerAsResource` is called on the response, with the result data and the `/examples/${id}` path, before the reply is sent.
- `src/modules/example/services/index.ts`: `exampleService` provides `publishById`, `archiveById` and `unarchiveById`.
- `src/types/index.ts` (and `src/types/auth-context.ts`): provides the `CallerContext` type.
- `src/modules/example/routes.ts`: the route table that these exports are wired into for the three POST endpoints.

## Notes
- The module doc says to delete this file if the module has no action doors.
- Success responses are always status 200 and carry `result.data`.
- The id check and the refusal check both short-circuit without throwing. Only service rejections reach `catchAs`.
- To add a new lifecycle event, add a service function and one more `eventHandler(...)` export. The handler name string is what appears in logs.
