---
source: src/modules/orders/controllers/get-orders-export.ts
source_sha256: eaf540e9391c44b665b91fec1da7b8754aae986bc6e56d72b9434114575aaf9b
context_sha256: db9c24ed57da7ea150a0d4e2f8570a0f05faf5329b804ee102b57e7a113a811f
generated_at: 2026-11-22T06:08:55.506423+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/controllers/get-orders-export.ts

## Purpose
Express controller for `GET /orders/export`. It takes the same filters as the orders list and returns the result as a streamed CSV download rather than a paged JSON response. The file is never buffered in memory. It is reachable only behind the `export:Order` permission (step-up gated) and the export's own rate limit, both mounted on the route.

## Key elements
- `exportOrdersQuerySchema` — `searchOrdersQuerySchema` from `get-orders` with `page` and `pageSize` omitted.
- `getOrdersExport` — the handler, wrapped in `namedHandler('getOrdersExport', ...)`:
  1. Validates input with `parseBody`, using `mergedSearchInput(request, honourUserIdFilter)`. It returns early if parsing fails.
  2. Calls `openOrderExport` on the order service, passing the parsed input, `request.authContext` and `callerContextOf(request)`.
  3. If the result has a `success` key, it is a rejection, and the handler calls `rejectResponse(response, status, errors)`.
  4. Otherwise it sets the headers and runs `pipeline(opened.source, opened.csv, response)`.
  5. On error, it either logs and destroys the connection, or hands off to `catchAs`.

## Relationships
- `src/modules/orders/controllers/get-orders.ts` — supplies `searchOrdersQuerySchema` (the base schema) and `honourUserIdFilter`.
- `src/infrastructure/surfaces/create-search-controller.ts` — `mergedSearchInput` builds the input from the request.
- `src/infrastructure/http/controller.ts` — `namedHandler`, `parseBody` and `catchAs` handle the handler wrapper, validation and error mapping.
- `src/infrastructure/http/request.ts` — `callerContextOf` extracts caller context from the request.
- `src/infrastructure/http/response.ts` — `rejectResponse` sends the error envelope.
- `src/modules/orders/services/index.ts` — provides the `orderService` used to open the export. The service returns the row source and CSV transform, or a rejection.
- `src/modules/shop/index.ts` — `shopTimezone()` gives the shop's timezone.
- `src/domain-primitives/time.ts` — `dayInZone` turns the current date into a calendar day in that timezone.
- `src/infrastructure/adapters/logger.ts` — the logger is used to record aborted exports.
- `src/modules/orders/routes.ts` — mounts this handler along with the permission and rate-limit middleware.

## Notes
- Success response headers: status 200, `Content-Type: text/csv; charset=utf-8`, `Cache-Control: private, no-store`. The comments say the file contains every customer's email, so it must not go to shared caches or the browser's disk cache (ASVS 14.3.2).
- The filename is `orders-<YYYY-MM-DD>.csv`, using the **shop's** calendar day, not the server's. `response.attachment()` sets `Content-Disposition`.
- Error handling depends on whether headers have been sent. If the request exceeds the row cap, the service rejects it with a 422 before any header is sent. Once headers are out, a failure can only cut the connection, so the handler logs a warning (`orders export aborted`) and calls `response.destroy()`, because no error envelope can be sent at that point.
- `pipeline` applies backpressure and destroys all streams on error. It also rejects if the client disconnects mid-download, and that rejection goes through the same catch path.
- The handler returns `Promise<void> | void`. It returns synchronously when validation fails.
