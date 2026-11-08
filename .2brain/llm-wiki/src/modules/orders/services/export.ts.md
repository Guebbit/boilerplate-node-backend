---
source: src/modules/orders/services/export.ts
sha256: b08ea95909f83f39524f5de06372b057d797dbd2ee1996959826572f34bf7179
generated_at: 2026-11-08T06:57:19.053078+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/export.ts

## Purpose

Produces a streaming CSV export of orders. The function validates the result size against a configurable cap, writes an audit entry, and returns a pipeable pair (object-mode `Readable` source + `csv-stringify` `Transform`) that the caller wires into the HTTP response. Nothing is written to disk or emailed; the stream is discarded if the client disconnects.

## Key elements

- **`auditedFilter(filters)`** — Sanitises the filter bag for the audit log: replaces the `email` value with the boolean `true` so no PII is persisted in audit metadata.
- **`orderCsvWriter()`** — Returns a `csv-stringify` `Transform` configured with `header`, UTF-8 BOM, fixed column order (`ORDER_CSV_COLUMNS`), and `escape_formulas` (prefixes `= + - @ \t \r` with `'` to prevent CSV/formula injection).
- **`OrderExport`** (interface) — The return shape: `{ source: Readable, csv: Transform }`.
- **`csvRows(filters, scope)`** — Async generator that iterates `orderRepository.streamMatching` and maps each order to a CSV row object via `toOrderCsvRow`.
- **`openOrderExport(search, authContext, context)`** — Main entry point. Resolves scope + fulfillment filter, runs a `countMatching` query, rejects with a localised 422 (`ORDER_EXPORT_TOO_LARGE`) if the cap is exceeded, otherwise records the audit row and returns the pipeable pair.

## Relationships

- **`../repository`** (`orderRepository`) — Supplies both `countMatching` (size guard) and `streamMatching` (row cursor).
- **`./read`** (`withFulfillmentFilter`) — Wraps the raw search filters with the caller's fulfillment constraint before counting/streaming.
- **`./scope`** (`callerScope`) — Derives the read-scope object from `AuthContext`.
- **`../domain`** (`ORDER_CSV_COLUMNS`, `toOrderCsvRow`) — Column definitions and the domain→CSV-row mapping.
- **`../config`** (`orderExportMaxRows`) — Configurable row cap.
- **`../audit`** (`ordersAuditActions`) — Enum value `ADMIN_ORDERS_EXPORTED` for the audit action field.
- **`@infrastructure/http/response`** (`generateReject`, `ResponseReject`) — Builds the 422 error envelope.
- **`@infrastructure/i18n`** (`t`) — Localises the "too large" message.
- **`@infrastructure/observability/audit`** (`recordAudit`) — Persists the audit row.
- **`@types`** — Type imports (`AuthContext`, `CallerContext`, `SearchOrdersRequest`).
- **`./index`** (`services/index.ts`) — Barrel that re-exports `openOrderExport`.

## Notes

- **Count-then-read:** the cap check is a single `COUNT` query; a refusal reads zero rows. A successful export streams lazily — no full materialisation.
- **BOM is intentional:** ensures Excel opens the file as UTF-8 rather than the OS default code page.
- **`escape_formulas` gap:** does not cover NUL (`\0`) or full-width CJK equivalents of `= + - @`; documented in the writer's docblock as a known, accepted limitation.
- **Paging is ignored:** `SearchOrdersRequest` may carry pagination fields, but the export always returns the entire filtered set (bounded only by the cap).
- **Disconnect safety:** `Readable.from` ties the async iterator to the stream; when the caller's `pipeline` destroys the stream (client hang-up), the underlying DB cursor is cancelled.
- **Audit metadata:** the `filter` recorded in the audit row is the sanitised version (`email: true`), never the raw PII.
