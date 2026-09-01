# src/modules/audit-logs/service.ts

## Purpose

The audit log service that bridges the audit pipeline to persistence: it is the `AuditSink` implementation (fire-and-forget write) registered by the audit-logs module, and the paginated read path behind `GET /observability/audit`.

## Key elements

- **`record(entry: AuditEntry): void`** — Persists an audit entry via `auditLogRepository.create`. Fire-and-forget by contract: returns `void`, catches all failures, increments `auditSinkFailuresTotal`, and logs a warning. A `.catch()` is attached so a rejected write never surfaces as an unhandled promise rejection.
- **`search(filters: AuditLogSearchFilters): Promise<PaginatedResult<AuditLogDocument>>`** — Reads a filtered, scoped, sorted page of entries (newest first) via `auditLogRepository.search`. Applies `sinceScope` and `AUDIT_SORT` at this layer. Rejections propagate to the caller.
- **`auditLogService`** — Barrel export object `{ record, search }` consumed by the module and the controller.

## Relationships

- **`./repository`** — Calls `auditLogRepository.create` (in `record`) and `auditLogRepository.search` / `.sinceScope` (in `search`); imports `AUDIT_SORT` and the `AuditLogSearchFilters` type.
- **`@infrastructure/observability/audit`** — Imports the `AuditEntry` type; `record` is the `AuditSink` implementation that the module registers against this module.
- **`@infrastructure/adapters/logger`** — Imports `logger` to emit a warning on each failed write.
- **`./metrics`** — Imports `auditSinkFailuresTotal` counter, incremented before the log line inside the `.catch`.
- **`./model`** — Imports `AuditLogDocument` type used in the `search` return.
- **`@infrastructure/persistence/create-repository`** — Imports the `PaginatedResult` type.
- **`./module`** — Registers `record` as the audit sink at import time.
- **`src/modules/observability/controllers/get-observability-audit.ts`** — Calls `search` to serve the admin dashboard endpoint.
- **`./index`** — Re-exports `auditLogService`.
- **`./tests/unit/service.test.ts`** — Unit-tests both `record` and `search`.

## Notes

- `record` is deliberately fail-open: a Mongo hiccup must not turn a rejected login into a 500. The compliance-of-record is the audit *logger* (already written); losing the queryable copy only degrades the dashboard.
- The `.catch()` in `record` is load-bearing: without it a rejected write becomes an unhandled promise rejection that can crash the process — a strictly worse outcome than the failed write itself.
- `search` propagates rejections (unlike `record`) because it answers an explicit admin request; a failed read *is* a failed request.
- Sort order and the `since` scope filter are applied here (service layer) rather than baked into the repository, keeping `create-repository` generic.
- `meta.totalItems` in a `search` result counts **all** entries matching the filters, not just the returned page — the dashboard uses this for "10 of 3,412" pagination.
