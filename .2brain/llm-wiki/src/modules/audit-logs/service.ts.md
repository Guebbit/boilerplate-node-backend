---
source: src/modules/audit-logs/service.ts
sha256: 69c32226cc2efaf7ca078dc1c32596d9969a61f5ebfb6f7c52a335de80ebe0ef
generated_at: 2026-10-14T15:05:47.289266+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/service.ts

## Purpose

The audit log service that acts as the persistence sink behind `@infrastructure/observability/audit` (registered by the module at import time) and provides the two read paths: `search` for a tenant's staff (`GET /audit`) and `searchIncidents` for the platform operator (`GET /observability/audit`). It also exposes `findOwnAuditEntries` for an account's Art. 15 data export.

## Key elements

- **`record(entry: AuditEntry): void`** — Stores an emitted audit entry. Fire-and-forget by contract: every failure is swallowed into a log line and a metric increment so a Mongo hiccup never turns a rejected login into a 500. The compliance record is the audit logger, which has already written the entry.
- **`search(filters): Promise<PaginatedResult<AuditEntryItem>>`** — Reads a filtered, newest-first page for a shop's staff. Applies `sinceScope` and `AUDIT_SORT`. Rejections propagate (a failed read is a failed request).
- **`searchIncidents(filters): Promise<PaginatedResult<AuditEntryItem>>`** — The operator's view. ANDs the caller's filters with `INCIDENT_SCOPE` (an explicit allow-list of security/auth/webhook actions), excludes shop-level rank refusals, and pseudonymises any `ip` field before returning.
- **`findOwnAuditEntries(userId): Promise<AuditEntryItem[]>`** — Returns every audit entry where the caller is the actor, for data export. Cursor-paginated internally (`OWN_ENTRIES_PAGE = 500`) to avoid a count+skip per page. Unpaginated externally: an export is a one-time full answer.
- **`auditLogService`** — Barrel export object bundling `record`, `search`, `searchIncidents`.
- **`INCIDENT_SCOPE`** — The Mongo query allow-list for the operator view: `security.*` (minus shop refusals), failed `auth.login`, specific credential-attack signals, and auto-disabled webhook subscriptions.
- **`SHOP_REFUSAL_REASONS`** — `['outranked', 'own']`; `metadata.reason` values excluded from the operator view.
- **`pseudonymisedIp(ip)`** — Returns `hmac:<12-char digest>` using the same keyed truncation the log pipeline uses, so correlation across surfaces still works.

## Relationships

- **`./repository.ts`** — Provides `auditLogRepository` (all reads/writes go through it), `AUDIT_SORT`, `AuditLogSearchFilters`, `OwnEntriesCursor`.
- **`src/infrastructure/observability/audit.ts`** — Source of the `AuditEntry` type; this service implements the `AuditSink` that module registers.
- **`src/infrastructure/adapters/logger.ts`** — `record` logs a warning on persist failure.
- **`src/infrastructure/security/pseudonymise.ts`** — `pseudonymisedIp` calls `pseudonymise('log', ip)`.
- **`src/infrastructure/persistence/create-repository.ts`** — Source of the `PaginatedResult` type used in return signatures.
- **`./metrics.ts`** — `auditSinkFailuresTotal.inc()` on write failure.
- **`./model.ts`** — `AuditLogDocument` type (cast in `record`).
- **`src/types/index.ts`** — `AuditEntryItem` shape used in all read return values.
- **`src/modules/audit-logs/module.ts`** — Imports this service and registers `record` as the sink.
- **`src/modules/audit-logs/controllers/get-audit.ts`** — Calls `search` for the staff endpoint.
- **`src/modules/observability/controllers/get-observability-audit.ts`** — Calls `searchIncidents` for the operator endpoint.
- **`tests/unit/service.test.ts`** — Unit tests for all exported functions.
- **`tests/integration/incidents.test.ts`** — Integration tests for `searchIncidents` / `INCIDENT_SCOPE`.

## Notes

- **Fail-open write, fail-loud read.** `record` swallows errors (by design: the entry was already logged by the compliance sink); `search` and `searchIncidents` let rejections propagate. Do not "fix" the asymmetry.
- **`void` + `.catch()` in `record` is deliberate.** The `.catch()` prevents an unhandled promise rejection (which *would* crash the process); the `void` return documents that the caller must not `await`.
- **`INCIDENT_SCOPE` is an allow-list, not a deny-list.** Adding a new security action requires explicitly adding it here; it will not appear in the operator view by default.
- **`meta.totalItems`** in both `search` and `searchIncidents` counts *all* matching entries, not just the page — the UI relies on this for "10 of 3,412" display.
- **`findOwnAuditEntries` filters on actor only.** It deliberately returns only rows where the caller is the subject, preventing cross-account leak in exports.
- **IP pseudonymisation key is `'log'`** — the same key the log pipeline uses, ensuring digest values match across the structured log and the queryable copy.
