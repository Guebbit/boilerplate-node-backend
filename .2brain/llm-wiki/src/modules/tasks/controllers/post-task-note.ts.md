---
source: src/modules/tasks/controllers/post-task-note.ts
sha256: a70e055088383d0dfae1753dc8f96d203593afef0013615d561edb1010904658
generated_at: 2026-11-08T08:32:23.988628+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/controllers/post-task-note.ts

## Purpose
Controller handler for `POST /tasks/:id/notes`. Validates the incoming note body, resolves the task ID, and delegates to the task service to append a staff note (append-only). Exists to keep HTTP-layer concerns (parsing, ID validation, response shaping) separate from business logic.

## Key elements
- **`createTrimmedNoteBody`** — Zod schema extending `CreateTaskNoteBody`; trims whitespace from the `body` field so a whitespace-only string is rejected at the field level (422) rather than passing as an empty note.
- **`postTaskNote`** (exported) — Express route handler. Validates the `:id` param via `requireId`, parses/validates the body, calls `taskService.addNote`, and responds 200 with the created `Task` or an error.

## Relationships
- **`src/infrastructure/http/controller.ts`** — supplies `catchAs` (unified error response), `parseBody` (Zod validation), and `refused` (domain-rejection short-circuit).
- **`src/infrastructure/http/ids.ts`** — `requireId` extracts and validates the task ID route param; returns early (no response) if invalid.
- **`src/infrastructure/http/request.ts`** — `callerContextOf` extracts authenticated caller identity to pass to the service layer.
- **`src/infrastructure/http/response.ts`** — `successResponse` shapes the 200 JSON envelope.
- **`src/infrastructure/http/schemas.ts`** — `trimmedInto` helper used to build the trimmed body schema.
- **`src/modules/tasks/service.ts`** — `taskService.addNote(id, body, callerContext)` performs the actual append; this controller is its sole HTTP entry point.
- **`src/modules/tasks/routes.ts`** — registers `postTaskNote` on the `POST /tasks/:id/notes` route.
- **`src/types/index.ts`** — source of the `CreateTaskNoteRequest` and `Task` type aliases used in signatures.

## Notes
- Returns HTTP **200** (not 201) on successful note creation.
- The controller uses a promise-chain (`.then`/`.catch`) rather than `async/await`; `catchAs` is the terminal error handler.
- `callerContextOf(request)` is passed into the service so audit/authorization context travels with the mutation without the service touching the raw Express request.
- The trimmed schema is a local const, not exported; it is specific to this endpoint's validation needs.
