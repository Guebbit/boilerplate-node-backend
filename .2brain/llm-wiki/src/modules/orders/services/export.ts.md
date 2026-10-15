---
source: src/modules/orders/services/export.ts
sha256: b08ea95909f83f39524f5de06372b057d797dbd2ee1996959826572f34bf7179
generated_at: 2026-10-15T11:07:59.812087+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/export.ts

## Purpose

Streams the filtered orders list as a CSV (no file on disk, no email). Validates the row count against a cap, records an audit entry, and returns a `Readable` source plus a CSV `Transform` for the caller to pipe into the HTTP response. A client disconnect tears down the cursor automatically.

## Key elements

- **`openOrderExport(search, authContext, context)`** — Main export. Resolves the caller's scope and fulfillment filter, counts matching rows, rejects with a 422 (`ORDER_EXPORT_TOO_LARGE`) if the count exceeds `orderExportMaxRows`, otherwise audits and returns an `OrderExport`.
- **`OrderExport`** (interface) — `{ source: Readable; csv: Transform }`, the contract the HTTP layer pipes into the response.
- **`csvRows(filters, scope)`** — Async generator that iterates `orderRepository.streamMatching` and maps each order via `toOrderCsvRow`.
- **`orderCsvWriter()`** — Builds a `csv-stringify` Transform with `header`, `bom` (UTF-8 BOM for Excel), `columns` from `ORDER_CSV_COLUMNS`, and `escape_formulas` (OWASP CSV-injection guard for `= + - @` tab CR).
- **`auditedFilter(filters)`** — Strips the `email` value from the filter bag, replacing it with `true`, so the audit log never records a person's address.

## Relationships

- **`src/modules/orders/repository.ts`** — Calls `orderRepository.countMatching` (guard) and `orderRepository.streamMatching` (row source).
- **`src/modules/orders/services/scope.ts`** — Calls `callerScope(authContext)` to narrow what the caller may read.
- **`src/modules/orders/services/read.ts`** — Calls `withFulfillmentFilter` to merge the search with the fulfillment dimension.
- **`src/modules/orders/domain/export.ts`** (via `domain/index.ts`) — Consumes `ORDER_CSV_COLUMNS` and `toOrderCsvRow`.
- **`src/modules/orders/config.ts`** — Reads the `orderExportMaxRows` cap.
- **`src/modules/orders/audit.ts`** — Uses `ordersAuditActions.ADMIN_ORDERS_EXPORTED` as the audit action identifier.
- **`src/infrastructure/observability/audit.ts`** — Calls `recordAudit` to write the audit row.
- **`src/infrastructure/http/response.ts`** — Calls `generateReject` to build the 422 rejection.
- **`src/infrastructure/i18n/index.ts`** — Calls `t('orders.export.too-large', …)` for the localized error message.
- **`src/types/auth-context.ts`** (via `types/index.ts`) — Types `AuthContext`, `CallerContext`, `SearchOrdersRequest`.
- **`src/modules/orders/services/index.ts`** — Re-exports this module's public surface.

## Notes

- **Nothing is persisted.** The export lives only as an in-memory stream; the caller is responsible for piping it into the response.
- **Paging is intentionally ignored** — the filter is the whole result set, bounded only by the row cap.
- **Audit row records count, never content.** The `rowCount` is stored; no individual order data appears in the audit log.
- **`escape_formulas` has a known gap:** it does not cover NUL (`\0`) or full-width Unicode equivalents (`＝＋－＠`). This is documented in the source as "documented, not handled."
- **The BOM is deliberate** — without it Excel falls back to the machine's code page and mangles accented characters.
- **Rejection costs exactly one `COUNT` query** and reads zero rows, by design.
