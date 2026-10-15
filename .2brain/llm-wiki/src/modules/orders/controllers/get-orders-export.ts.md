---
source: src/modules/orders/controllers/get-orders-export.ts
sha256: 8753de3ca816fad52a4b4e29c5cc5d4373ee31a5fd6ac582379e64b9e0b63bc1
generated_at: 2026-10-15T10:59:48.248825+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/get-orders-export.ts

## Purpose

Handles `GET /orders/export` by streaming the same filtered order list as `GET /orders` as a CSV attachment. The response is a cursor-based stream (never buffered in memory), so the handler must pipe directly to the HTTP response rather than build a body.

## Key elements

- **`exportOrdersQuerySchema`** — `searchOrdersQuerySchema` with `page` and `pageSize` omitted; a file has no paging.
- **`getOrdersExport`** (exported handler) — The single export of this module. Wrapped in `namedHandler('getOrdersExport', …)`. On success it sets `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="orders.csv"`, and `Cache-Control: private, no-store`, then pipes `opened.source → opened.csv → response` via `node:stream/promises` `pipeline`. On failure *before* headers are sent it calls `rejectResponse`; *after* headers are sent it logs a warning and calls `response.destroy()`.

## Relationships

- **`get-orders.ts`** — Reuses `searchOrdersQuerySchema` (stripped of paging fields) and `honourUserIdFilter` so the export honours the same user-ID scope as the list endpoint.
- **`services/index.ts`** — Calls `orderService.openOrderExport(parsed, authContext, callerContext)`, which returns either an error envelope or `{ source, csv }` streams.
- **`routes.ts`** — Mounts this handler at `orders.any.export` behind a step-up gate and the export's rate budget.
- **`@infrastructure/http/controller.ts`** — Provides `namedHandler`, `parseBody`, and `catchAs` used for structured error handling.
- **`@infrastructure/http/response.ts`** — Provides `rejectResponse` for sending an error envelope before headers are committed.
- **`@infrastructure/http/request.ts`** — Provides `callerContextOf` to pass the authenticated caller into the service.
- **`@infrastructure/surfaces/create-search-controller.ts`** — Provides `mergedSearchInput`, which folds the query/body/search params into one input object.
- **`@infrastructure/adapters/logger.ts`** — Emits a `warn` log when the export stream is destroyed mid-transfer.

## Notes

- The handler is a two-phase error path: before `response.headersSent` it can send a JSON error envelope; after that the only option is `response.destroy()`. Any `catchAs` call after headers are out is dead code by design.
- `Cache-Control: private, no-store` is intentional (ASVS 14.3.2) because the CSV contains every customer's email address.
- `pipeline` (from `node:stream/promises`) propagates backpressure and destroys all streams on early close (e.g., client hangs up mid-download), rejecting the returned promise.
- The route is reachable only through `orders.any.export` in `routes.ts`, which applies both the step-up authentication gate and the per-IP rate budget before this handler ever runs.
