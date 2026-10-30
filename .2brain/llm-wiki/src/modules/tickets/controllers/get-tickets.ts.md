---
source: src/modules/tickets/controllers/get-tickets.ts
sha256: ce339bbd97e1c6811e8b8824ca8fece9eb96599172dc5daa996c49847ee5e351
generated_at: 2026-10-29T06:01:27.656191+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/controllers/get-tickets.ts

## Purpose

Controller that serves `GET /tickets` and `POST /tickets/search` (staff-only). It delegates the actual query to `ticketService.search` and is built via the shared `createSearchController` factory. The file exists so the routes layer can register a ready-made handler without duplicating validation or pagination logic.

## Key elements

- **`searchTicketsQuerySchema`** — Extends the orval-generated `SearchTicketsBody` (from `@api/schemas.zod`) with `page`, `pageSize`, and `overdue` fields. These three are declared with `pageSchema` / `pageSizeSchema` / `optionalBooleanSchema` so that raw query-string text is coerced to numeric/boolean types before the service sees them.
- **`getTickets`** *(exported)* — The controller instance returned by `createSearchController({ entity: 'tickets', schema, runSearch })`. `runSearch` calls `ticketService.search(parsed, callerContextOf(request))` and resolves with a `TicketsResponse`.

## Relationships

- **`src/infrastructure/surfaces/create-search-controller.ts`** — Factory that packages schema validation, entity naming, and the `runSearch` callback into a single router-compatible controller.
- **`src/infrastructure/http/schemas.ts`** — Supplies the reusable `pageSchema`, `pageSizeSchema`, and `optionalBooleanSchema` zod validators used to extend the search body.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf`, which extracts the authenticated caller's identity/jurisdiction from the incoming request and passes it to the service.
- **`src/modules/tickets/service.ts`** — Source of `ticketService.search`, the function that actually executes the ticket query for the given caller context.
- **`src/modules/tickets/routes.ts`** — Registers the `getTickets` controller on the `GET /tickets` and `POST /tickets/search` routes.
- **`src/types/index.ts`** — Defines `TicketsResponse`, the return type of the search operation.

## Notes

- The module doc comment states explicitly that this endpoint is **never Redis-cached**; the result is per-person jurisdiction, not a shop-wide shared answer.
- `page`, `pageSize`, and `overdue` arrive as plain strings in the GET query string (or form-encoded POST body), hence the explicit string→type coercion in the schema extension. The POST JSON path does not need this coercion, but the shared schema handles both uniformly.
- Both HTTP verbs share a single controller instance; the factory abstracts over the method difference.
