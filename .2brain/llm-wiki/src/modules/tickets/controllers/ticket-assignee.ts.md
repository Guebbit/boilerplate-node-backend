---
source: src/modules/tickets/controllers/ticket-assignee.ts
sha256: 09d301bc12bb874f73e16ee60241cea39ad4f7e6db37f32b9ecc3ffdb39fa6f7
generated_at: 2026-10-29T06:01:56.203735+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/controllers/ticket-assignee.ts

## Purpose

HTTP controller for the ticket-assignment endpoints. Exposes two handlers: `PUT /tickets/:id/assignee` (assign a ticket to a user, or take it by assigning yourself) and `DELETE /tickets/:id/assignee` (unassign / give the ticket back). Each handler validates input, delegates to the ticket service, and serialises the result.

## Key elements

- **`putTicketAssignee(request, response)`** — Validates the `:id` param via `requireId`, parses the JSON body against the `AssignTicketBody` Zod schema, then calls `ticketService.assign(id, body.userId, callerContext)`. Returns the updated `Ticket` on success or a structured error on refusal/failure.
- **`deleteTicketAssignee(request, response)`** — Validates the `:id` param, then calls `ticketService.unassign(id, callerContext)`. Same success/refusal/catch pattern as the PUT handler.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Supplies the shared HTTP helpers `catchAs`, `parseBody`, and `refused` used by both handlers for error handling and body validation.
- **`src/infrastructure/http/ids.ts`** — `requireId` extracts and validates the `:id` route parameter; on failure it writes the response and the handler short-circuits.
- **`src/infrastructure/http/request.ts`** — `callerContextOf` pulls the authenticated caller's identity from the request for the service layer.
- **`src/infrastructure/http/response.ts`** — `successResponse` writes the standard success envelope with status 200 and a `Ticket` payload.
- **`src/modules/tickets/routes.ts`** — Registers these two exported functions as the route handlers for the assignee endpoints.
- **`src/modules/tickets/service.ts`** — `ticketService.assign` and `ticketService.unassign` perform the actual domain logic; this controller is a thin adapter around them.
- **`src/types/index.ts`** — Provides the `AssignTicketRequest` and `Ticket` types used for request typing and response generics.

## Notes

- Both handlers follow an identical guard-and-delegate pattern: validate → early-return on failure → service call → `refused` check → success. There is no try/catch; async errors are funnelled through `catchAs`.
- The `:id` is typed as `string` in the Express param generic; `requireId` is responsible for any numeric/format validation.
- The module docstring notes that "taking" a ticket is simply assigning it to yourself — there is no separate `take` endpoint.
- Response status is hardcoded to **200** (not 204 or 201) for both PUT and DELETE, consistent with the rest of the codebase's `successResponse` convention.
