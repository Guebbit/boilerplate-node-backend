---
source: src/modules/tickets/controllers/get-ticket-by-id.ts
sha256: 5381a1e31069a4fa4b8f485064445b282e1ddf31037f39aa7568470cb899e974
generated_at: 2026-10-29T06:01:09.339464+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/controllers/get-ticket-by-id.ts

## Purpose

Express route handler for `GET /tickets/:id`. Retrieves a single ticket from the staff queue, scoped to the caller's jurisdiction, and records an audit event when the ticket belongs to a visitor.

## Key elements

- **`getTicketById(request, response)`** — exported handler. Validates the `:id` param, delegates to `ticketService.getById`, and either sends the ticket (200) or a 404/403. No distinction is made between malformed, unknown, or out-of-jurisdiction IDs — all yield 404.
- **Audit branch** — when `result.data.source === TicketSource.visitor`, calls `recordStaffRead` with key `'read:Ticket'` and action `ADMIN_TICKET_VIEWED`, attaching the ticket's `subjectId` as `ownerId`. Staff-created tickets skip auditing.

## Relationships

- **`src/modules/tickets/service.ts`** — calls `ticketService.getById(id, callerContext)` to fetch the ticket; the service enforces jurisdiction.
- **`src/modules/tickets/audit.ts`** — imports `ticketsAuditActions.ADMIN_TICKET_VIEWED` for the audit action label.
- **`src/kernel/staff-read.ts`** — calls `recordStaffRead` to log the read event.
- **`src/infrastructure/http/ids.ts`** — uses `requireId` to validate/extract the `:id` route param (returns 404 with a generic "item gone" message on failure).
- **`src/infrastructure/http/request.ts`** — uses `callerContextOf(request)` to derive the caller's jurisdiction context.
- **`src/infrastructure/http/response.ts`** — uses `successResponse` to emit the 200 payload.
- **`src/infrastructure/http/controller.ts`** — uses `refused` (maps rejected results to 403) and `catchAs` (maps thrown errors to a 500 with a context tag).
- **`src/types/index.ts`** — imports `TicketSource` to distinguish visitor tickets from staff-created ones.
- **`src/modules/tickets/routes.ts`** — registers this handler on the `GET /tickets/:id` path (inferred from module layout).

## Notes

- The 404 message is intentionally generic (`'generic.error-item-gone'`) to avoid leaking whether an ID exists or is simply out of jurisdiction.
- Auditing is **conditional on `TicketSource.visitor`**; staff-authored tickets do not trigger `recordStaffRead`.
- The handler is synchronous in its fast-fail path (`requireId`) but returns a `Promise` in all other cases; `if (!id) return Promise.resolve()` keeps the return type uniform.
