---
source: src/modules/tickets/controllers/ticket-doors.ts
sha256: 267749ed74cc830455607c0e626dc39dcc73ca5b80060d3f7e04ef0b75262cc9
generated_at: 2026-10-29T06:02:07.263329+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/controllers/ticket-doors.ts

## Purpose

Defines the three bodyless staff-facing ticket status-change endpoints (`POST /tickets/:id/resolve`, `/mark-spam`, `/reopen`). Each handler follows the same read-id → call-service → return-200-with-ticket shape, implemented via a single factory to avoid triplication.

## Key elements

- **`doorController`** (internal factory) — accepts a handler name and a service method, returns an Express handler that: extracts and validates the `:id` param, invokes the service method with the caller context, checks for a refusal, sends a `200` with the resulting `Ticket`, and catches errors via `catchAs`.
- **`postTicketResolve`** — `doorController('postTicketResolve', ticketService.resolve)`. Bound to `POST /tickets/:id/resolve`.
- **`postTicketMarkSpam`** — `doorController('postTicketMarkSpam', ticketService.markSpam)`. Bound to `POST /tickets/:id/mark-spam`.
- **`postTicketReopen`** — `doorController('postTicketReopen', ticketService.reopen)`. Bound to `POST /tickets/:id/reopen`.

## Relationships

- **`src/infrastructure/http/ids.ts`** — `requireId` extracts and validates the `:id` param; on failure it writes its own error response and the handler returns early.
- **`src/infrastructure/http/request.ts`** — `callerContextOf(request)` derives the caller's identity/permissions, passed as the second argument to the service method.
- **`src/infrastructure/http/controller.ts`** — `refused` inspects the service result for a denial and short-circuits the 200; `catchAs` formats unexpected errors into an error response.
- **`src/infrastructure/http/response.ts`** — `successResponse<Ticket>` serialises the ticket and sends a `200`.
- **`src/modules/tickets/service.ts`** — `ticketService.resolve`, `.markSpam`, `.reopen` are the actual domain operations each door delegates to.
- **`src/modules/tickets/routes.ts`** — registers these three exports on the Express router.
- **`src/types/index.ts`** — supplies the `Ticket` type used as the response payload generic.

## Notes

- All three endpoints are **staff-only** (indicated by the `/* (staff) */` annotations); no body is expected.
- `doorController` types its `run` parameter as `(typeof ticketService)['resolve']`, so the three service methods are contractually required to share that exact signature.
- The handler name passed to `doorController` is forwarded to `catchAs` for structured error logging — keep it stable if log pipelines key on it.
