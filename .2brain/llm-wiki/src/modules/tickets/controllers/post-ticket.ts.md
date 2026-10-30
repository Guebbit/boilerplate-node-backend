---
source: src/modules/tickets/controllers/post-ticket.ts
sha256: 9c3e1a9e16e9408c5a8d7af90b05d94df54cf237cb9d37a0278c7b133f5f4a4f
generated_at: 2026-10-29T06:01:47.253821+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/controllers/post-ticket.ts

## Purpose

Controller for `POST /tickets`, the module's sole public write endpoint. It validates and trims the inbound body, delegates creation to the ticket service, and replies with a `201` containing the presented ticket record.

## Key elements

- **`createContactTicketSchema`** (module-level const) — Extends the generated `CreateContactTicketBody` (from `@api/schemas.zod`) by wrapping every text field in `trimmedInto`, so whitespace-only values are treated as empty. Optional fields (`name`, `orderNumber`) are unwrapped before re-wrapping. All length/email bounds are inherited from the generated schema, not restated.
- **`postTicket`** (exported handler) — Parses the request body via `parseBody`, calls `ticketService.create(body, authContext?.id)`, presents the result with `presentTicket(createdTicket, NO_ACTIONS)`, and sends it through `createdResponse` with a `Location` of `/tickets/:id`. Errors are funneled through `catchAs(response, 'postTicket')`.

## Relationships

- **`@infrastructure/http/controller`** — supplies `parseBody` (schema validation with early-return) and `catchAs` (error-to-response mapping).
- **`@infrastructure/http/response`** — supplies `createdResponse` for the `201` reply.
- **`@infrastructure/http/schemas`** — supplies `trimmedInto`, the helper that produces the trimmed variants of each Zod field.
- **`../service`** — `ticketService.create` performs the actual ticket insertion and sends the support-notification email; the controller owns no business logic.
- **`../presenter`** — `presentTicket` shapes the domain `Ticket` into the API record; `NO_ACTIONS` passes no action metadata.
- **`../routes`** — mounts this handler on `POST /tickets`. The file docstring notes it is placed *above* the admin gate rather than exempted from it.
- **`@types`** — provides the `CreateContactTicketRequest` (request body type) and `Ticket` (response body type) used in the handler's signature.

## Notes

- `request.authContext` is set only for a valid signed-in session (upstream `getAuth`); an expired or missing token leaves it unset and the request proceeds anonymously. Its `id` becomes the ticket's `subjectId`, tying the record to the account for later export/erasure.
- The notification email (recipient, language) is a service-side concern, not a controller concern — the controller never touches mail configuration.
- The schema extension is local to this file; the generated `CreateContactTicketBody` is imported read-only and not mutated.
