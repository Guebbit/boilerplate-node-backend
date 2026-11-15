---
source: src/modules/tasks/controllers/post-task-note.ts
sha256: c2739d2ab48a334566dc59b7136b6a03c3d688fa5dc7a25b665682f845d246ff
generated_at: 2026-11-14T22:06:54.696741+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/controllers/post-task-note.ts

## Purpose

Controller handler for `POST /tasks/:id/notes`. Validates the incoming note body, extracts the caller context, and delegates to the task service to append a staff note. The operation is append-only: there is no update or delete path for notes.

## Key elements

- **`createTrimmedNoteBody`** – Zod schema built by extending `CreateTaskNoteBody` so the `body` field is trimmed before validation. This makes a whitespace-only note a 422 rather than a valid empty string.
- **`postTaskNote`** (exported) – Express handler. Flow: `requireId` → `parseBody` (against the trimmed schema) → `taskService.addNote(id, body, caller)` → `refused` / `successResponse` (200) → `catchAs` for unexpected errors.

## Relationships

- **`src/infrastructure/http/controller.ts`** – provides `parseBody`, `refused`, `catchAs` (the shared validation/error plumbing used in every handler).
- **`src/infrastructure/http/ids.ts`** – `requireId` resolves and 404s the `:id` route param.
- **`src/infrastructure/http/request.ts`** – `callerContextOf` extracts the authenticated caller's identity/context for the service call.
- **`src/infrastructure/http/response.ts`** – `successResponse` shapes the 200 JSON envelope.
- **`src/infrastructure/http/schemas.ts`** – `trimmedInto` wraps a schema shape so the value is `.trim()`-ed before further validation.
- **`src/modules/tasks/routes.ts`** – registers `postTaskNote` on the `POST /tasks/:id/notes` route.
- **`src/modules/tasks/services/index.ts`** – this file imports `taskService` from here and calls its `addNote` method to perform the note-append.
- **`src/types/index.ts`** – supplies the `CreateTaskNoteRequest` and `Task` type imports.

## Notes

- The trim-then-validate pattern is deliberate: without `trimmedInto`, a body of `"   "` would pass as a valid non-empty string and create a useless note. The extension exists *only* to turn that into a field-level 422.
- Success status is **200**, not 201, consistent with the rest of the tasks controller set.
- The handler returns `Promise.resolve()` early on validation failures; it never throws synchronously.
