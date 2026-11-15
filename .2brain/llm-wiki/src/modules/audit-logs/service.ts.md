---
source: src/modules/audit-logs/service.ts
sha256: 094241467a1e2e15e76029644f9f61ec7949b34dcf90b78b121fb66f13d2cb66
generated_at: 2026-11-14T19:25:49.408256+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/service.ts

## Purpose

The single service layer for audit logs. It wraps `auditLogRepository` with the domain policies (scope, sort, pseudonymisation, retention window) that each read path needs, and provides the `record` function that `@infrastructure/observability/audit` calls as its `AuditSink`. One file, five entry points: write, tenant-staff read, operator read, full-account export, and GDPR "who consulted" export.

## Key elements

- **`record(entry: AuditEntry): void`** — Fire-and-forget persist of one audit entry. Fail-open by contract: every rejection is counted (`auditSinkFailuresTotal`) and logged via `logger.warn`; the `void` return and the explicit `.catch()` keep the floating promise from surfacing as an unhandled rejection.
- **`search(filters): Promise<PaginatedResult<AuditEntryItem>>`** — Paginated, newest-first read for a tenant's staff (`GET /audit`). Applies `sinceScope` and `ownOrderScope` as secondary scope, sorts with `AUDIT_SORT`. Rejections propagate to the caller.
- **`searchIncidents(filters): Promise<PaginatedResult<AuditEntryItem>>`** — Operator-facing read (`GET /observability/audit`). ANDs the caller's filters with `INCIDENT_SCOPE` (an explicit allow-list), then maps each row through `presentIncidentEntry` to pseudonymise addresses.
- **`findOwnAuditEntries(userId): Promise<AuditEntryItem[]>`** — Full, actor-only export for data-subject requests. Cursor-based (page size `OWN_ENTRIES_PAGE = 500`), recursive, no count/skip. Deliberately unpaginated: one call, full answer.
- **`findConsultationsOf(userId): Promise<Consultations>`** — GDPR Art. 15 "who consulted my data" section. Queries within the `NODE_AUDIT_RETENTION_DAYS` window, maps `action` → human-readable `purpose` via `STAFF_READ_PURPOSES`. Returns `{ windowDays, entries }`.
- **`Consultation` / `Consultations`** — Export interfaces consumed by the data-export controller.
- **`INCIDENT_ACTIONS`** — Typed (`satisfies readonly AuditAction[]`) list of credential-attack and degraded-endpoint actions; a rename in the action vocabulary breaks compilation.
- **`INCIDENT_SCOPE`** — MongoDB `$nor`/`$or` filter that admits `security.*` (minus shop-rank refusals), failed `auth.login`, the three `INCIDENT_ACTIONS`, and nothing else.
- **`OWN_ENTRIES_PAGE`** (500) — Cursor page size for the export walk.
- **`auditLogService`** — The exported object bundling all five functions; the single door other modules import.

## Relationships

- **`src/modules/audit-logs/repository.ts`** — Primary data access: `auditLogRepository.create`, `.search`, `.ownEntriesPage`, `.consultationsOf`, `.sinceScope`, `.ownOrderScope`, and the `AUDIT_SORT` constant all come from here.
- **`src/modules/audit-logs/model.ts`** — Provides the `AuditLogDocument` type used when casting the entry at the write boundary.
- **`src/modules/audit-logs/config.ts`** — `auditLogsConfig()` supplies `NODE_AUDIT_RETENTION_DAYS` for the consultations window.
- **`src/modules/audit-logs/metrics.ts`** — `auditSinkFailuresTotal` incremented on every failed `record` write.
- **`src/modules/audit-logs/presenter.ts`** — `presentIncidentEntry` pseudonymises each operator-view row before it leaves the service.
- **`src/modules/audit-logs/module.ts`** — Registers `auditLogService.record` as the `AuditSink` at module load time.
- **`src/infrastructure/observability/audit.ts`** — Source of the `AuditAction` and `AuditEntry` types; this file is the runtime implementation of the `AuditSink` interface defined there.
- **`src/infrastructure/persistence/create-repository.ts`** — `PaginatedResult` type for all read-path return values.
- **`src/infrastructure/adapters/logger.ts`** — `logger.warn` in the `record` failure path.
- **`src/domain-primitives/time.ts`** — `DAY_MS` constant for computing the retention-window start date.
- **`src/kernel/staff-read.ts`** — `STAFF_READ_PURPOSES` map used to translate staff-read actions into the `purpose` string in `Consultation` rows.
- **`src/modules/access/index.ts`** — `SHOP_REFUSAL_REASONS` excluded from the operator's incident scope via `$nor`.

## Notes

- **Fail-open vs. fail-closed is deliberate and asymmetric.** `record` swallows errors (a Mongo blip must not turn a rejected login into a 500); `search`, `searchIncidents`, and the export functions let rejections propagate because they answer an explicit request.
- **`INCIDENT_SCOPE` is an allow-list, not a prefix filter.** The JSDoc explains why: `auth.*` contains both incidents (failed login) and non-incidents (successful login), and `system.user.*` carries customer PII. Each admitted action is a named decision; adding one requires editing the file.
- **`findOwnAuditEntries` is actor-only by construction.** It reads only rows where the *actor* is `userId`. There is no code path that reads another actor's rows via this function; the security invariant is the query, not a post-filter.
- **`void` return on `record` is a lint/type signal**, not a functional one: it tells the caller (and the compiler) that the floating promise is intentional, paired with the `.catch()` that prevents an unhandled-rejection crash in production or a failed Jest assertion in tests.
