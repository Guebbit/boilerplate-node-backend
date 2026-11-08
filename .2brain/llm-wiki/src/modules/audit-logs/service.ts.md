---
source: src/modules/audit-logs/service.ts
sha256: c57766316466c0df1c7fcf6d90c0569f62219a9b86c1c3364f8d0d23a0dff130
generated_at: 2026-11-08T05:09:24.117272+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/service.ts

## Purpose

The service layer for the audit-logs module. It is the write sink (registered as the `AuditSink` at module import time) and the sole read path for two audiences: the platform operator (incident view) and tenant staff (full log view). It also provides the per-user export used by data-subject requests.

## Key elements

- **`record(entry)`** — Fire-and-forget persist of a single `AuditEntry` into the repository. Returns `void`; failures are counted (`auditSinkFailuresTotal`) and logged, never propagated.
- **`search(filters)`** — Paginated, filtered read for tenant staff. Applies `sinceScope` and `ownOrderScope` from the repository plus `AUDIT_SORT`. Rejections propagate to the caller.
- **`searchIncidents(filters)`** — Operator-facing read restricted to the `INCIDENT_SCOPE` allow-list. Maps results through `presentIncidentEntry` before returning.
- **`findOwnAuditEntries(userId)`** — Cursor-paginated full export of one user's entries (actor-only). Walks pages of `OWN_ENTRIES_PAGE` (500) until exhausted.
- **`INCIDENT_ACTIONS`** — `readonly` array of specific credential-attack and degraded-endpoint actions the operator sees.
- **`INCIDENT_SCOPE`** — MongoDB filter: `$or` over `security.*`, failed `auth.login`, and the four incident actions; `$nor` excludes shop rank-refusal entries.
- **`OWN_ENTRIES_PAGE`** — Exported constant (500) controlling cursor page size.
- **`auditLogService`** — The single exported object bundling `record`, `search`, `searchIncidents`, and `findOwnAuditEntries`.

## Relationships

- **`./repository`** — `record` and all read functions delegate to `auditLogRepository`; `AUDIT_SORT` and scope helpers are imported from here.
- **`@infrastructure/observability/audit`** — Source of the `AuditEntry` / `AuditAction` types; this file is the sink that module's emitter calls.
- **`@infrastructure/adapters/logger`** — `logger.warn` is the sole failure surface in `record`.
- **`@infrastructure/persistence/create-repository`** — Provides the `PaginatedResult<T>` shape returned by every read path.
- **`@modules/access`** — Imports `SHOP_REFUSAL_REASONS` so the operator scope can exclude shop-level rank refusals.
- **`./metrics`** — `auditSinkFailuresTotal` is incremented inside `record`'s `.catch`.
- **`./presenter`** — `presentIncidentEntry` transforms each incident row before it reaches the controller.
- **`./model`** — `AuditLogDocument` is the cast target in `record`.
- **`./module.ts`** — Registers `record` as the active `AuditSink` at import time.
- **`./controllers/get-audit.ts`** — Consumes `search` (tenant) and `searchIncidents` (operator).

## Notes

- **Fail-open vs. fail-loud.** `record` swallows errors by contract (a Mongo hiccup must not turn a rejected login into a 500). `search` / `searchIncidents` / `findOwnAuditEntries` propagate rejections—these are explicit reads.
- **`void` return on `record`.** The `void` keyword marks the floating promise as deliberate; the `.catch()` prevents an unhandled-rejection crash under Jest or in production.
- **`INCIDENT_SCOPE` is an explicit allow-list**, not a prefix match. The comment in the source explains why: `auth.*` contains both incidents and benign logins, and `system.user.*` carries customer PII.
- **`findOwnAuditEntries` is actor-only by design.** The `userId` parameter is the caller's own id; passing another user's id would be the exact leak Art. 15 GDPR is meant to prevent.
- **Stryker suppression.** The `.catch` body in `record` is wrapped in `// Stryker disable all` / `// Stryker restore all` so mutation testing does not flag the intentional no-op-after-log.
