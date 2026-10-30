---
source: src/modules/orders/controllers/get-orders-export.ts
sha256: a794910c4c5237bc1ec6a5f769d7f4aa2532077df49014dddf9c9aa17c44dc08
generated_at: 2026-10-29T04:38:24.302345+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/get-orders-export.ts

## Purpose

Implements `GET /orders/export`, a CSV download endpoint that streams an order list (filtered by the same criteria as the paginated list endpoint) directly to the HTTP response without buffering in memory. It exists to let operators export filtered order data while keeping peak memory flat and enforcing the same authorization and rate-limit gates as the list endpoint.

## Key elements

- **`getOrdersExport`** (exported) — Express handler wrapped in `namedHandler('getOrdersExport', …)`. Parses the query via `parseBody`, calls `orderService.openOrderExport`, sets CSV / attachment / `Cache-Control: private, no-store` headers, then streams with `pipeline(source, csv, response)`.
- **`exportOrdersQuerySchema`** — `searchOrdersQuerySchema.omit({ page, pageSize })`; reuses the list's filter fields minus pagination.
- **Error path** — If headers have not yet been sent, the standard `catchAs` envelope is written; if they have, the handler logs a warning and calls `response.destroy()`.

## Relationships

- **`get-orders.ts`** — Imports `searchOrdersQuerySchema` and `honourUserIdFilter` so the export shares the exact same filter logic and user-scoping rules as the paginated list.
- **`src/modules/orders/services/index.ts`** — Imports `orderService` and calls `openOrderExport(parsed, authContext, callerContext)`, which returns either a `{ success, status, errors }` rejection or a `{ source, csv }` stream pair.
- **`src/modules/shop/index.ts`** — Imports `shopTimezone()` to compute the attachment filename's calendar date in the shop's local zone.
- **`src/domain-primitives/time.ts`** — Imports `dayInZone` for that same filename date.
- **`src/infrastructure/http/controller.ts`** — Provides `namedHandler`, `parseBody`, and `catchAs` used for handler registration, input validation, and error-envelope writing.
- **`src/infrastructure/http/request.ts`** — Imports `callerContextOf` to forward the authenticated caller into the service call.
- **`src/infrastructure/http/response.ts`** — Imports `rejectResponse` to write the validation/rejection envelope before any streaming begins.
- **`src/infrastructure/surfaces/create-search-controller.ts`** — Imports `mergedSearchInput` to combine the raw query string with any body-supplied filters before schema validation.
- **`src/infrastructure/adapters/logger.ts`** — Imports `logger` for the post-header abort warning.
- **`src/modules/orders/routes.ts`** — Mounts this handler on the `/orders/export` route (the file itself is not imported here; the dependency is the route table referencing the exported symbol).

## Notes

- The response is a **stream**, not a JSON envelope. Once the first CSV byte is written there is no way to send an error body; the only recovery is `response.destroy()`.
- `Cache-Control: private, no-store` is deliberate (ASVS 14.3.2) because the file contains customer PII (email addresses).
- The attachment filename uses the **shop's** timezone (`shopTimezone()`), not the server's UTC date, so the file name reflects the shop's business calendar day.
- The handler is reachable only behind the `export:Order` step-up permission and an export-specific rate budget (both enforced upstream in the route table, not in this file).
- `pipeline` (from `node:stream/promises`) provides backpressure and guarantees all streams are destroyed on error, including the case where the client disconnects mid-download.
