---
source: src/modules/tickets/controllers/get-ticket-summary.ts
sha256: d946846e391cbd9212ef24fdac58378e11f93cd2c8fe3e1ea1f0e2074c90d966
generated_at: 2026-10-29T06:01:16.991251+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/controllers/get-ticket-summary.ts

## Purpose

Thin Express controller for the `GET /tickets/summary` endpoint, which returns aggregated ticket counts for the staff badge. It delegates all business logic to `ticketService.summary` and only handles request/response plumbing.

## Key elements

- **`getTicketSummary`** (exported) — The sole export. An Express route handler that:
  1. Extracts caller context from the request via `callerContextOf(request)`.
  2. Calls `ticketService.summary(context)` and returns the result as a 200 JSON response via `successResponse`.
  3. Catches any thrown/rejected error and forwards it to the shared error handler through `catchAs(response, 'getTicketSummary')`.

## Relationships

- **`src/modules/tickets/routes.ts`** — Registers `getTicketSummary` as the handler for the `GET /tickets/summary` route (staff-only).
- **`src/modules/tickets/service.ts`** — Provides the `ticketService.summary(context)` method that performs the actual counting logic.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse`, which serializes the counts payload and sets status 200.
- **`src/infrastructure/http/request.ts`** — Supplies `callerContextOf`, which extracts authentication/caller metadata from the Express `Request`.
- **`src/infrastructure/http/controller.ts`** — Supplies `catchAs`, the shared error-catch wrapper that maps rejections to an HTTP error response.

## Notes

- The controller contains **no** business logic; all counting lives in `ticketService.summary`. If the response shape or status code needs to change, look here; if the *data* needs to change, look in the service.
- The string `'getTicketSummary'` passed to `catchAs` is used as the error-log label — keep it in sync with the function name when renaming.
- Follows the module's standard one-liner controller pattern: `serviceCall → successResponse | catchAs`. No additional middleware, validation, or branching is expected here.
