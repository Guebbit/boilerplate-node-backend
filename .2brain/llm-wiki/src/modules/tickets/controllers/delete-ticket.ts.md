---
source: src/modules/tickets/controllers/delete-ticket.ts
sha256: 4fc17ff242f135c0c58c7db83d06d633fa2ba174f66cbfc41bb4c5af9b375b29
generated_at: 2026-10-29T06:00:58.937399+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/controllers/delete-ticket.ts

## Purpose

Express handler for `DELETE /tickets/:id`. It validates the ticket id, delegates the permanent removal to the ticket service with the caller's context, and returns a bare `204 No Content` on success. It is hand-written (not built via the `createDeleteController` factory) because the tickets module has no soft-delete tier and the factory assumes a soft/hard delete triplet.

## Key elements

- **`deleteTicket`** (exported) — The only export. Signature: `(request: Request<{ id: string }>, response: Response) => Promise<void>`.
  1. Validates `:id` via `requireId`; a malformed or unknown id short-circuits with a 404 (`generic.error-item-gone`).
  2. Calls `ticketService.removeById(id, callerContextOf(request))`.
  3. If the service result is a refusal (out-of-jurisdiction), `refused()` emits a 404.
  4. On success, sends `204 No Content` via `noContentResponse`.
  5. Any thrown error is mapped to a structured response by `catchAs(response, 'deleteTicket')`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Provides `catchAs` (error → response mapping) and `refused` (service-result → 404 short-circuit).
- **`src/infrastructure/http/ids.ts`** — Provides `requireId`, which parses/validates the route param and responds 404 on failure.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf`, extracting the authenticated caller's scope for the service call.
- **`src/infrastructure/http/response.ts`** — Provides `noContentResponse` (the 204 helper).
- **`src/modules/tickets/routes.ts`** — Registers `deleteTicket` as the handler for `DELETE /tickets/:id`.
- **`src/modules/tickets/service.ts`** — Exposes `ticketService.removeById`, the actual deletion logic this controller delegates to.

## Notes

- A refused (out-of-jurisdiction) result is answered with **404, not 403**, consistent with the "generic.error-item-gone" convention used for `requireId`. This intentionally hides whether a ticket exists.
- The doc block explicitly calls out *why* this isn't a factory-generated controller; if a soft-delete tier is ever added to tickets, this file should be reconsidered against `createDeleteController`.
