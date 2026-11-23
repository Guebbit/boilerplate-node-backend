---
source: src/modules/tasks/controllers/post-task-note.ts
generated_at: 2026-11-22T07:58:37.386649+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/tasks/controllers/post-task-note.ts

## Purpose
Express controller for `POST /tasks/:id/notes`, which lets staff append a note to a task. Notes are append-only. The controller validates the task id and request body, delegates to the task service, and returns the updated task.

## Key elements
- `createTrimmedNoteBody` (module-private): `CreateTaskNoteBody` extended so `body` goes through `trimmedInto(...)`. A whitespace-only note is therefore treated as empty and gets the same field-level 422 an empty one does.
- `postTaskNote` (exported): the request handler.
  1. `requireId(request, response, { notFound: 'generic.error-item-gone' })` validates the `:id` param. If it returns a falsy value, the handler stops (the helper has already written the response).
  2. `parseBody(createTrimmedNoteBody, request.body, response)` validates the body. If it returns a falsy value, the handler stops.
  3. `taskService.addNote(id, body.body, callerContextOf(request))` adds the note.
  4. If `refused(response, result)` is true, the handler returns (a refusal has been written to the response). Otherwise it sends `successResponse<Task>(response, result.data, 200)`.
  5. Rejections go to `catchAs(response, 'postTaskNote')`.

## Relationships
- `src/infrastructure/http/controller.ts`: supplies `parseBody`, `refused` and `catchAs`, which handle body validation, service-refusal responses and error handling.
- `src/infrastructure/http/ids.ts`: `requireId` validates the route id.
- `src/infrastructure/http/request.ts`: `callerContextOf` builds the caller context passed to the service.
- `src/infrastructure/http/response.ts`: `successResponse` writes the 200 response.
- `src/infrastructure/http/schemas.ts`: `trimmedInto` trims the note body before validation.
- `src/modules/tasks/services/index.ts`: exports `taskService`, which this controller calls to add the note.
- `src/types/index.ts`: provides the `Task` and `CreateTaskNoteRequest` types.
- `src/modules/tasks/routes.ts`: presumably wires this handler to the route. The routing itself is not visible in this file.

## Notes
- Every handler path returns a Promise. Early exits return `Promise.resolve()`.
- Success returns HTTP 200 with the updated `Task`, not 201.
- The "staff" restriction is not enforced in this file. It is only noted in the route comment, so any enforcement happens elsewhere (for example in the routes or the service).
- The `CreateTaskNoteBody` schema comes from the `@api/schemas.zod` alias.
- The module doc comment references `docs/modules/tasks.md#notes`, but that file is not in the repository.
