# src/modules/audit-logs/service.ts

## Purpose

Audit log service that provides the two operations the audit path needs: writing emitted entries into the queryable store (fire-and-forget) and reading a filtered, paginated page of entries for the admin dashboard. It sits between the domain types (`AuditEntry`, `AuditLogDocument`) and the repository, applying collection-specific policies (sort order, `since` scoping) that the generic base repository does not encode.

## Key elements

- **`record(entry: AuditEntry): void`** — Persists one audit entry via `auditLogRepository.create`. Deliberately fire-and-forget: failures increment `auditSinkFailuresTotal`, emit a `logger.warn`, and are swallowed. A `void` + `.catch()` pair ensures a rejected write never becomes an unhandled rejection.
- **`search(filters: AuditLogSearchFilters): Promise<PaginatedResult<AuditLogDocument>>`** — Reads a filtered page, newest-first. Applies `auditLogRepository.sinceScope` and `AUDIT_SORT` on top of the base `search`. Errors propagate to the caller (unlike `record`).
- **`auditLogService`** — Namespace object exporting `{ record, search }`. The `search` symbol is also exported directly.

## Relationships

- **`./repository`** — Primary collaborator. Provides `auditLogRepository`, `AUDIT_SORT`, and the `AuditLogSearchFilters` type consumed by both functions.
- **`./metrics`** — Supplies `auditSinkFailuresTotal`, incremented inside `record`'s error handler before the log line.
- **`./model`** — Provides the `AuditLogDocument` type used in the `search` return type and the cast inside `record`.
- **`@infrastructure/observability/audit`** — Source of the `AuditEntry` type. This file's `record` is the `AuditSink` implementation that `module.ts` registers for that contract.
- **`@infrastructure/adapters/logger`** — Used in `record` to emit the warning line on write failure.
- **`@infrastructure/persistence/base-repository`** — Provides the `PaginatedResult<T>` return type shared with `search`.
- **`./module`** — Registers `record` as the process-wide audit sink at import time.
- **`./index`** — Barrel that re-exports this service's public API.
- **`./tests/unit/service.test.ts`** — Unit tests exercising `record` and `search`.
- **`@modules/observability/controllers/get-observability-audit`** — The HTTP controller that calls `search` to serve `GET /observability/audit`.

## Notes

- **Fail-open is intentional, not accidental.** `record` returns `void` and swallows all errors because it runs inline with request handling (including rejected logins). A Mongo hiccup here must not turn a rejected request into a 500. The compliance-of-record is the audit *logger* upstream; losing the queryable copy only degrades the dashboard.
- **Error semantics differ by function on purpose.** `record` hides failures (metric + warn log); `search` propagates them because it answers an explicit admin request.
- **`sinceScope` and sort are applied in the service, not the repository.** This keeps the repository generic and lets the service own collection-specific policies.
- **`meta.totalItems` reflects all matching documents, not just the page**, enabling the dashboard to display "10 of 3,412" and page through.
