---
source: src/modules/tasks/controllers/post-task.ts
sha256: dea57a11d0115d4cf0c420d72f8722f345ac5c29115f539ea8436260f9656b6c
generated_at: 2026-11-14T22:07:35.156683+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/controllers/post-task.ts

## Purpose

Controller for `POST /tasks`, the module's sole public write endpoint. It validates and trims the inbound contact-task body, delegates creation to the task service, and returns a bare `202` (no response body). It is mounted above the admin gate in `../routes` rather than being carved out of it.

## Key elements

- **`createContactTaskSchema`** (module-level const) — Extends the generated `CreateContactTaskBody` Zod schema, wrapping every text field with `trimmedInto` so whitespace-only values read as empty. Optional fields (`name`, `orderNumber`) are unwrapped before wrapping. All bounds (e.g. the 254-char email cap) come from the generated schema; none are re-declared here.
- **`postTask`** (exported function) — The Express handler. Parses the request body against the schema via `parseBody`, calls `taskService.create(body, request.authContext?.id)`, then sends `acceptedResponse` on success or routes errors through `catchAs(response, 'postTask')`.

## Relationships

- **`src/modules/tasks/routes.ts`** — Mounts `postTask` on the `POST /tasks` route, placing it above the admin-gate middleware so it remains public.
- **`src/modules/tasks/services/index.ts`** — Exports `taskService`, which this controller imports and invokes to create the task. The service owns the support-notification logic (recipient, language) rather than the controller.
- **`src/infrastructure/http/controller.ts`** — Supplies `parseBody` (schema validation that short-circuits with an error response) and `catchAs` (uniform async error handler).
- **`src/infrastructure/http/response.ts`** — Supplies `acceptedResponse`, which sends the `202` with no body.
- **`src/infrastructure/http/schemas.ts`** — Supplies `trimmedInto`, the helper that produces a trimmed Zod string schema.
- **`src/types/index.ts`** — Provides the `CreateContactTaskRequest` type used in the handler's request-parameter signature.

## Notes

- `request.authContext` is populated only when a valid session exists upstream (`getAuth`). An expired or absent token leaves it `undefined`; the request still succeeds as anonymous. When present, its `id` becomes the task's `subjectId`, binding the record to the account for later export and erasure.
- The handler is synchronous in its validation path but returns a Promise from the `taskService.create` chain; the `if (!body) return;` guard means the function can return either `undefined` or a `Promise<Response>`.
- The response is intentionally body-less: the message is queued to the main mailbox, so there is nothing meaningful to echo back.
