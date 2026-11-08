---
source: src/modules/orders/controllers/get-orders-export.ts
sha256: a794910c4c5237bc1ec6a5f769d7f4aa2532077df49014dddf9c9aa17c44dc08
generated_at: 2026-11-08T06:46:20.266998+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/get-orders-export.ts

## Purpose
Implements the `GET /orders/export` endpoint: streams the full filtered order list as a CSV download. It reuses the same search filters as the paginated list view but strips paging, and pipes the result directly into the HTTP response so the file is never buffered in memory.

## Key elements
- **`exportOrdersQuerySchema`** — `searchOrdersQuerySchema` with `page` and `pageSize` removed; defines the only valid query shape for the export.
- **`getOrdersExport`** — the sole export. A `namedHandler` that:
  1. Parses the query via `mergedSearchInput` + `honourUserIdFilter`.
  2. Calls `orderService.openOrderExport(parsed, authContext, callerContext)`.
  3. On success, sets `Content-Type: text/csv`, `Cache-Control: private, no-store`, and a `Content-Disposition` filename (`orders-<shop-day>.csv`), then streams `opened.source → opened.csv → response` with `pipeline` (back-pressure aware, destroys all streams on error).
  4. On failure *before* headers are sent, delegates to `catchAs`; *after* headers are out, logs a warning and destroys the socket.

## Relationships
- **`get-orders.ts`** — borrows `searchOrdersQuerySchema` and `honourUserIdFilter` so export filters stay in lockstep with the list view.
- **`src/modules/orders/services/index.ts`** — calls `orderService.openOrderExport` to obtain a `{ source, csv }` stream pair.
- **`src/modules/shop/index.ts`** — reads `shopTimezone()` to format the calendar day in the download filename.
- **`src/domain-primitives/time.ts`** — provides `dayInZone` for that same filename.
- **`src/infrastructure/http/controller.ts`** — supplies `namedHandler`, `parseBody`, `catchAs`.
- **`src/infrastructure/http/request.ts`** — supplies `callerContextOf`.
- **`src/infrastructure/http/response.ts`** — supplies `rejectResponse` for pre-header failures.
- **`src/infrastructure/surfaces/create-search-controller.ts`** — supplies `mergedSearchInput`.
- **`src/infrastructure/adapters/logger.ts`** — logs `warn` when the stream is aborted mid-download.
- **`src/modules/orders/routes.ts`** — mounts `getOrdersExport` on the `GET /orders/export` path (with `export:Order` permission gate and export rate budget, per the module doc-comment).

## Notes
- Once the CSV has started streaming there is no JSON envelope left to send; a mid-stream error can only destroy the connection. Client disconnects mid-download reject the `pipeline` promise.
- The `Cache-Control: private, no-store` header is intentional (ASVS 14.3.2) because the CSV contains customer emails; it must never be cached by intermediaries or the browser.
- The filename's date uses the **shop's** timezone (`shopTimezone()`), not the server's local time.
- Access is gated by two independent mechanisms mounted on the route (the `export:Order` step-up permission and an export-specific rate budget) — neither is enforced inside this handler.
