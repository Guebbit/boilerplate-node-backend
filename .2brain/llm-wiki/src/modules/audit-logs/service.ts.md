---
source: src/modules/audit-logs/service.ts
sha256: 67837c1dfd28434afad902bbdc2abfcc6ed441f07b608b86793d9950d84dbb6f
generated_at: 2026-09-23T18:27:41.624531+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/service.ts

## Purpose

The service layer for the audit-logs module. It provides the write path (`record`) that persists emitted audit entries to the database and the read path (`search`) that serves paginated, filtered audit queries to operator and tenant dashboards. It sits between the observability audit sink (which emits entries) and the repository (which talks to MongoDB).

## Key elements

- **`record(entry: AuditEntry): void`** — Persists a single audit entry. Fail-open by contract: returns `void`, swallows all failures into a metric increment and a `logger.warn` line. Deliberately `void` + `.catch()` so a rejected write cannot surface as an unhandled rejection.
- **`search(filters: AuditLogSearchFilters): Promise<PaginatedResult<AuditEntryItem>>`** — Reads a filtered page of audit entries, newest first. Applies `since` scoping and `AUDIT_SORT`. Errors propagate to the caller (unlike `record`), since this is answering an explicit request.
- **`auditLogService`** — Barrel object exporting `{ record, search }` for use by the module and controllers.

## Relationships

- **`./repository`** — Consumes `auditLogRepository` (create + search) and `AUDIT_SORT`.
- **`@infrastructure/observability/audit`** — Implements the `AuditSink` interface; imports the `AuditEntry` type.
- **`@infrastructure/adapters/logger`** — Emits a warning line when a write fails.
- **`./metrics`** — Increments `auditSinkFailuresTotal` on write failure.
- **`@infrastructure/persistence/create-repository`** — Imports the `PaginatedResult` type used in `search`'s return signature.
- **`./model`** — Imports `AuditLogDocument` (cast target in `record`).
- **`./module`** — Registers `record` as the active audit sink at import time.
- **`./controllers/get-audit`** and **`src/modules/observability/controllers/get-observability-audit`** — Call `search` to serve `GET /audit` and `GET /observability/audit`.
- **`./tests/unit/service.test.ts`** — Unit-tests both `record` and `search`.

## Notes

- **Fail-open is intentional, not lazy.** The compliance record is the audit _logger_ (upstream), which has already written the entry. Losing the queryable Mongo copy only degrades the dashboard. A Mongo hiccup during a rejected login must not become a 500.
- **Error handling is asymmetric on purpose.** `record` swallows; `search` propagates. `record` is a fire-and-forget side effect; `search` is the answer to an explicit user request.
- **Stryker mutation-testing is disabled** around the `logger.warn` call in `record`'s `.catch` — the warning is the _only_ observable effect of a swallowed error, so Stryker would mutate it into a no-op that the test suite cannot distinguish.
- The `void` keyword before `auditLogRepository.create(...)` marks the floating promise as deliberate; the actual safety net is the trailing `.catch()`.
