---
source: src/modules/example/controllers/post-example-event.ts
sha256: aeef80e4e97b54a7ecc3f77b3ab71f974ffc9e871981dab5b4379375db151b53
generated_at: 2026-11-14T19:56:59.284653+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/controllers/post-example-event.ts

## Purpose

Thin action controller that exposes the three lifecycle doors for the example resource — `POST /examples/:id/publish`, `/archive`, and `/unarchive`. Each handler validates the id, delegates to the corresponding service method, and formats the HTTP response. All business rules live in the service; this file only wires the HTTP edges.

## Key elements

- **`EventDoor` (type)** — Signature of the service function behind one door: `(id, context) => Promise<…>`.
- **`eventHandler` (internal factory)** — Accepts an operation name and an `EventDoor` function, returns a named Express handler. The operation name is carried into logs and metrics via `namedHandler` / `catchAs`.
- **`postExamplePublish`** — Exported handler for publishing a draft; calls `exampleService.publishById`.
- **`postExampleArchive`** — Exported handler for archiving a draft or published example; calls `exampleService.archiveById`.
- **`postExampleUnarchive`** — Exported handler for returning an archived example to draft; calls `exampleService.unarchiveById`.

## Relationships

- **`src/modules/example/services/index.ts`** — Consumes `exampleService` and its three `*ById` methods; the only business-logic dependency.
- **`src/modules/example/routes.ts`** — Imports the three exported handlers and registers them on their respective `POST` routes.
- **`src/infrastructure/http/controller.ts`** — Provides `namedHandler`, `refused`, and `catchAs` used to wrap the handler and handle error/refusal paths.
- **`src/infrastructure/http/ids.ts`** — Provides `requireId`, which extracts and validates the `:id` param, responding with a 404 on failure.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf` to build the `CallerContext` passed into the service.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` to finalize a 200 reply.
- **`src/infrastructure/http/preconditions.ts`** — Provides `answerAsResource` to set the `Location` header on the response before the body is sent.
- **`src/types/index.ts` / `src/types/auth-context.ts`** — Source of the `CallerContext` type imported from `@types`.

## Notes

- **Factory, not three separate handlers.** All three doors share one `eventHandler` closure; they differ only in the `operation` string (for logging) and the `door` function. Adding a fourth door is a one-line export.
- **`if (!id) return Promise.resolve()`** is not a no-op: `requireId` has already sent the 404 response, so this simply prevents the `.then`/`.catch` chain from running on a dead request.
- **`answerAsResource` is called before `successResponse`.** It mutates the response (sets `Location`); the order matters.
- **Delete this file** if the module never gains an action (lifecycle) door — it exists solely to host those three POST handlers.
