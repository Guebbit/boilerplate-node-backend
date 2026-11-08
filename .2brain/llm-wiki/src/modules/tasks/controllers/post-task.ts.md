---
source: src/modules/tasks/controllers/post-task.ts
sha256: 6a280769f49b20343036f1277ce7e44eac337d626c736375b241beb5df5db688
generated_at: 2026-11-08T08:32:34.934022+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/controllers/post-task.ts

## Purpose

HTTP controller for the `POST /tasks` endpoint — the single public write in the tasks module. It validates and normalises the incoming contact-task payload, delegates creation to `taskService`, and returns a bare `202 Accepted` with no body.

## Key elements

- **`createContactTaskSchema`** – A local Zod schema built by extending the generated `CreateContactTaskBody`. It wraps every text field (`name`, `email`, `subject`, `message`, `orderNumber`) in `trimmedInto` so that whitespace-only values validate as empty. Optional fields are unwrapped and re-wrapped to preserve `.optional()`.
- **`postTask`** (exported) – The Express route handler. Calls `parseBody` with the trimmed schema; on success passes the body and an optional `authContext?.id` to `taskService.create`; responds with `acceptedResponse` (202, no body) on success and routes failures through `catchAs(response, 'postTask')`.

## Relationships

- **`src/infrastructure/http/controller.ts`** – Supplies `parseBody` (schema validation + error short-circuit) and `catchAs` (async error → HTTP response mapping) used inside `postTask`.
- **`src/infrastructure/http/response.ts`** – Supplies `acceptedResponse`, the shared 202 writer.
- **`src/infrastructure/http/schemas.ts`** – Supplies `trimmedInto`, the helper that wraps a Zod string schema to trim before validation.
- **`src/modules/tasks/routes.ts`** – Mounts `postTask` on the `POST /tasks` path. Per the module docstring this route sits *above* the admin gate rather than being exempted from it.
- **`src/modules/tasks/service.ts`** – `taskService.create(body, subjectId?)` performs the actual task persistence and support-notification dispatch. The controller only forwards input and the optional caller id.
- **`src/types/index.ts`** – Provides the `CreateContactTaskRequest` type used to type the Express `Request` generic.

## Notes

- The endpoint is **public**: no auth is required. `request.authContext` is populated only for a valid signed-in session; an expired or missing token leaves it `undefined` and the request proceeds as anonymous.
- The `authContext?.id` is forwarded as `subjectId`, tying the task to an account for export/erasure purposes.
- Support-notification logic (recipient, language) lives entirely inside `taskService.create`; the controller never touches it.
- Field length/regex bounds (e.g. the 254-char email cap) come from the upstream `CreateContactTaskBody` contract and are deliberately **not** re-stated in this file.
- The response is always `202` with an **empty body** by design — the message is stored and queued, so there is nothing meaningful to return.
