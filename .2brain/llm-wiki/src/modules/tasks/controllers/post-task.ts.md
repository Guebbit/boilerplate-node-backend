---
source: src/modules/tasks/controllers/post-task.ts
source_sha256: e1bc485ef5f691b034b5bd55ec09ba0bc08a28d9e091c7d0b77e0f85cdea3ffb
context_sha256: fc4de04884590ad31355d737127b9c1bf4b9fb803ced73a4d7aa9e00b3f44ee8
generated_at: 2026-11-22T07:58:58.464482+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/tasks/controllers/post-task.ts

## Purpose
Express controller for `POST /tasks`, the module's only public write endpoint. It validates a contact-form body, hands it to the task service, and answers `202` with no body. The route is mounted above the admin gate in `../routes` rather than exempted from it.

## Key elements
- `createContactTaskSchema` (module-private): the generated `CreateContactTaskBody` extended so `name`, `email`, `subject`, `message` and `orderNumber` are trimmed via `trimmedInto`. `name` and `orderNumber` stay optional. All length bounds, including the 254 email cap, come from the generated contract and are not restated here.
- `postTask(request, response)` (exported): the request handler.
  1. Parses the body with `parseBody`. If parsing fails it returns early, since `parseBody` has already handled the response.
  2. Calls `taskService.create(body, request.authContext?.id)`.
  3. On success it sends `acceptedResponse(response)`.
  4. On failure it uses `catchAs(response, 'postTask')`.

## Relationships
- `src/infrastructure/http/controller.ts`: supplies `parseBody` (body validation) and `catchAs` (error-to-response handling).
- `src/infrastructure/http/schemas.ts`: supplies `trimmedInto`, which wraps the generated field schemas.
- `src/infrastructure/http/response.ts`: supplies `acceptedResponse`, which sends the `202`.
- `src/modules/tasks/services/index.ts`: supplies `taskService`, whose `create` does the persistence and the support notification.
- `src/types/index.ts`: supplies the `CreateContactTaskRequest` type for the request body.
- `src/modules/tasks/routes.ts`: mounts this handler, above the admin gate.

## Notes
- The endpoint is public, but a signed-in sender is recognised. `request.authContext` is set only for a valid session (populated upstream by `getAuth`). An expired or missing token leaves it unset, and the post is treated as anonymous.
- `authContext.id` becomes the task's `subjectId`, so data export and erasure follow the message to the account.
- The support notification (who is told, and in which language) belongs to `taskService.create`, not to this controller.
- The response is `202` with no body, because the message is stored and queued for the main mailbox.
- Whitespace-only text trims to empty, so it is treated as empty input.
