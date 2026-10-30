---
source: src/modules/audit-logs/service.ts
sha256: c57766316466c0df1c7fcf6d90c0569f62219a9b86c1c3364f8d0d23a0dff130
generated_at: 2026-10-29T03:18:28.528486+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/service.ts

## Purpose

The audit-log service that bridges the write path (recording emitted audit entries into the persistence layer) and the three read paths (tenant-staff listing, platform-operator incident view, and per-account data export). It applies the collection's scoping, sorting, and filtering policies on top of the raw repository, keeping those decisions out of the repository itself.

## Key elements

- **`record(entry)`** — Fire-and-forget sink for `AuditEntry`. Returns `void`; every failure is caught, counted (`auditSinkFailuresTotal`), and logged as a warning. Deliberately fail-open so a persistence hiccup never turns an in-flight request into a 500.
- **`search(filters)`** — Paginated read for a tenant's staff (`GET /audit`). Applies `sinceScope`, `ownOrderScope`, and `AUDIT_SORT`. Rejections propagate to the caller.
- **`searchIncidents(filters)`** — Operator-only read (`GET /observability/audit`). Intersects the caller's filters with the hard-coded `INCIDENT_SCOPE` allow-list, then maps every item through `presentIncidentEntry` to pseudonymise shop-identifying fields.
- **`INCIDENT_ACTIONS`** — Readonly tuple of the specific credential-attack / degraded-endpoint actions the operator should see. Typed with `satisfies readonly AuditAction[]` so a rename is a compile error.
- **`INCIDENT_SCOPE`** — MongoDB query (`$or` / `$nor`) that defines the operator's allow-list. Excludes `security.forbidden` entries whose `metadata.reason` falls in `SHOP_REFUSAL_REASONS` (the shop's own rank refusals).
- **`findOwnAuditEntries(userId)`** — Cursor-paginated full export of a single user's own entries (500-per-page loop). Unpaginated from the caller's perspective: returns the complete `AuditEntryItem[]`. Intended for GDPR Art. 15 data exports.
- **`auditLogService`** — The single exported object bundling `record`, `search`, `searchIncidents`, and `findOwnAuditEntries`. This is the module's public door.

## Relationships

- **`./repository`** — Source of `auditLogRepository`, `AUDIT_SORT`, and the filter/cursor types. This service is the primary consumer of the repository's `create`, `search`, `sinceScope`, `ownOrderScope`, and `ownEntriesPage` methods.
- **`@infrastructure/observability/audit`** — Supplies the `AuditAction` and `AuditEntry` types; this file's `record` is the `AuditSink` implementation that the observability layer calls.
- **`./module`** — Registers `record` as the audit sink at import time; this file is the sink's target.
- **`./metrics`** — Provides `auditSinkFailuresTotal`, incremented on every failed `record` write before the log line.
- **`./presenter`** — Provides `presentIncidentEntry`, used by `searchIncidents` to pseudonymise operator-facing rows.
- **`./model`** — Supplies the `AuditLogDocument` type used in the `create` cast.
- **`@modules/access`** — Supplies `SHOP_REFUSAL_REASONS`, used inside `INCIDENT_SCOPE` to carve out the shop's own rank-refusal entries from the operator view.
- **`@infrastructure/adapters/logger`** — Warning-level log on failed persistence in `record`.
- **`@infrastructure/persistence/create-repository`** — Source of the `PaginatedResult` type shared across all read paths.
- **`./controllers/get-audit`** — Consumes `auditLogService.search` and `searchIncidents` to serve the two HTTP endpoints.
- **`tests/unit/service.test.ts`, `tests/integration/repository.test.ts`, `tests/integration/incidents.test.ts`** — Unit and integration coverage for the service, repository, and incident-scoping logic respectively.

## Notes

- **Fail-open is a contract, not a shortcut.** `record` swallows errors by design: the compliance-grade audit *logger* has already written the entry, so losing the queryable copy only degrades the admin dashboard. The `void` return + `.catch()` pattern prevents unhandled rejections in both production (`app/error-handling.ts`) and Jest.
- **`INCIDENT_SCOPE` is an explicit allow-list, not a prefix glob.** The comment calls out that `auth.*` and `system.user.*` carry customer-identifying data, so broad prefix matches were rejected. Adding a new incident action requires a deliberate, reviewed edit here.
- **`findOwnAuditEntries` is actor-only by construction.** The `ownEntriesPage` repository method is scoped to the caller's `userId`; there is no code path in this service that widens the read. An export that leaked other actors' rows would be the exact breach Art. 15 prevents.
- **Stryker annotations** (`Stryker disable all` / `Stryker restore all`) wrap the error-log block in `record` to suppress mutation-testing noise on the intentional swallow-and-log path.
- **`meta.totalItems` semantics:** In both `search` and `searchIncidents`, `totalItems` is the count of *all* matching entries, not the current page. The UI relies on this to render "10 of 3,412".
