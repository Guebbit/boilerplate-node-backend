---
source: src/modules/tickets/controllers/post-ticket-note.ts
sha256: 6adb74c0b17bc140569080384f948d3a55a550ace018c5355ee09a5a026d3563
generated_at: 2026-10-29T06:01:37.103491+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/controllers/post-ticket-note.ts

## Purpose

Handles `POST /tickets/:id/notes` — appending a staff-only note to an existing ticket. It validates the request (ID lookup, body trimming), delegates to the ticket service, and returns the updated ticket with a `201` status.

## Key elements

- **`createTrimmedNoteBody`** (local const) — Extends `CreateTicketNoteBody` (Zod) so the `body` field is trimmed before length/emptiness checks run. Ensures a whitespace-only string is rejected at the field level (422) rather than passed through as an empty note.
- **`postTicketNote`** (exported function) — The Express handler. Extracts the ticket ID, parses/validates the request body, calls `ticketService.addNote(id, body, callerContext)`, and sends either a `201` success or a structured error via `refused`/`catchAs`.

## Relationships

- **`src/modules/tickets/service.ts`** — Calls `ticketService.addNote(id, noteBody, callerContext)` to perform the actual append.
- **`src/modules/tickets/routes.ts`** — Registers this handler on the `POST /tickets/:id/notes` route (this file is the target of that binding).
- **`src/infrastructure/http/controller.ts`** — Supplies `parseBody`, `refused`, and `catchAs` for request validation and error mapping.
- **`src/infrastructure/http/ids.ts`** — Supplies `requireId` for safe ticket-ID extraction (returns early with a 404 message if missing/invalid).
- **`src/infrastructure/http/request.ts`** — Supplies `callerContextOf` to derive the authenticated staff identity passed into the service.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse` for the `201` JSON reply.
- **`src/infrastructure/http/schemas.ts`** — Supplies `trimmedInto`, a Zod transform used to trim the `body` field before other validations.
- **`src/types/index.ts`** — Provides the `CreateTicketNoteRequest` and `Ticket` types used in the handler's generic signature.

## Notes

- The endpoint is **append-only** and staff-scoped; there is no delete or edit path for notes.
- The body field is trimmed *before* the minimum-length check runs, so a string of only spaces produces a field-level 422 rather than slipping through as an empty-string note.
- The handler is intentionally thin: all business logic (authorization, note creation, ticket re-read) lives in `ticketService.addNote`.
