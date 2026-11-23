---
source: src/modules/orders/services/export.ts
source_sha256: de06ecc1ed089e1d01e000c96dfa5e71f0a91da6733a988b8fd71e1517d70196
context_sha256: d3755d1a609f0de13afafacf95c2a923e8e097186213ae16f3e6d86d808c2364
generated_at: 2026-11-22T06:20:18.165455+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/services/export.ts

## Purpose
Builds the orders CSV export as a stream. It reuses the order list's filters, counts the matching rows against a cap, and then returns a database cursor source plus a CSV writer for the caller to pipe into the HTTP response. Nothing is written to disk or mailed, because a stored file can be forgotten and a link can be forwarded (GDPR Art. 5(1)(e)). If the client disconnects, the caller's `pipeline` destroys the stream and the cursor with it.

## Key elements
- `openOrderExport(search, authContext, context)`: the only export. It does the following, in order:
  1. Applies `withFulfillmentFilter` and `callerScope` to get the filters and the read scope.
  2. Counts matches. If the count exceeds `orderExportMaxRows()`, it returns a 422 reject with `ERROR_CODES.ORDER_EXPORT_TOO_LARGE` and a translated message, and no rows are read.
  3. Otherwise it records an audit entry (`ADMIN_ORDERS_EXPORTED`, outcome `success`, target type `order`) with the filter and `rowCount`.
  4. Returns `{ source, csv }`.
- `OrderExport`: the interface of the result. `source` is an object-mode `Readable` of row objects and `csv` is a `Transform` that turns them into CSV text.
- `csvRows` (internal): an async generator that streams the repository's matching orders and maps each one through `toOrderCsvRow`.
- `orderCsvWriter` (internal): a `csv-stringify` writer with these options:
  - header line
  - UTF-8 BOM, so Excel reads accents correctly
  - columns taken from `ORDER_CSV_COLUMNS`
  - `escape_formulas: true`
- `auditedFilter` (internal): copies the filter for the audit row but replaces `email` with `true`, so no personal data is stored.

## Relationships
- `src/modules/orders/services/read.ts`: `withFulfillmentFilter` gives the export the same filter handling as the list.
- `src/modules/orders/services/scope.ts`: `callerScope` turns the `AuthContext` into the read scope that bounds the file.
- `src/modules/orders/repository.ts`: `orderRepository` provides the count that acts as the cap guard and the cursor stream of matching orders.
- `src/modules/orders/config.ts`: `orderExportMaxRows()` supplies the row cap.
- `src/modules/orders/domain/index.ts` (and `src/modules/orders/domain/export.ts`): provides `ORDER_CSV_COLUMNS` and `toOrderCsvRow`.
- `src/modules/orders/audit.ts` and `src/infrastructure/observability/audit.ts`: `ordersAuditActions` supplies the action name and `recordAudit` writes the row.
- `src/infrastructure/http/response.ts`: `generateReject` builds the 422 response.
- `src/infrastructure/i18n/index.ts`: `t` translates the too-large message.
- `src/types/index.ts`: supplies `AuthContext`, `CallerContext` and `SearchOrdersRequest`.

## Notes
- The row count is the only guard. Paging in `search` is ignored, and the file holds the whole result.
- The audit row is written when the export is handed over, before any row is streamed. It records the number of rows the export will carry, and a client that disconnects early does not change it.
- `escape_formulas` does not cover `\0` or the full-width `＝＋－＠`. The source comments say this is documented and not handled.
- The return type is `Promise<OrderExport | ResponseReject>`, so callers must check for a reject before piping.
