---
source: src/modules/audit-logs/service.ts
source_sha256: 66bf3be243cc2805813b3ba653ffe08c48fc0a46af1713c7d4ef59ef5977d2ec
context_sha256: 5e94bb8e34b9e1a3df514542357fe68d9d9e3279e9f51d20604f946788df8356
generated_at: 2026-11-22T04:28:12.491580+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/audit-logs/service.ts

## Purpose
The audit-log module's service layer. It persists emitted audit entries (the sink behind `@infrastructure/observability/audit`) and serves the read paths: the platform operator's `GET /observability/audit`, a tenant staff member's `GET /audit` (gated on `read:AuditLog`), and an account's own data export.

## Key elements
- `record(entry)`: the audit sink. Fire-and-forget, returns `void`. It calls `auditLogRepository.create(...)` and swallows failures. On failure it increments `auditSinkFailuresTotal` first, then logs a `warn`, so a Mongo error never turns a request into a 500.
- `search(filters)`: a filtered page of entries, newest first. It applies `sinceScope` and `ownOrderScope` and sorts with `AUDIT_SORT`. `meta.totalItems` counts all matches, not the page. Rejections propagate.
- `INCIDENT_ACTIONS`: a `satisfies readonly AuditAction[]` list of attack and degraded-endpoint actions: two-factor challenge failed, OAuth failed, refresh-token reuse detected, webhook subscription auto-disabled.
- `INCIDENT_SCOPE`: the Mongo allow-list for the operator's view.
  - It includes all `security.*` actions, `auth.login` with outcome `failure`, and the `INCIDENT_ACTIONS`.
  - It excludes `security.forbidden` rows whose `metadata.reason` is in `SHOP_REFUSAL_REASONS`.
- `searchIncidents(filters)`: runs `search` with `INCIDENT_SCOPE` ANDed with `sinceScope`, then maps each item through `presentIncidentEntry`, which pseudonymises addresses.
- `OWN_ENTRIES_PAGE` (exported, 500): the page size used when an export walks a trail.
- `findOwnAuditEntries(userId)`: all entries where the user is the actor, for the account export. Unpaginated. It reads in cursor-based pages through `ownEntriesPage` until `next` is empty.
- `Consultation` / `Consultations` (exported interfaces): the shape of the export's "who consulted my data" section: `timestamp`, `targetType`, `targetId`, `purpose`, plus `windowDays`. No staff identity is included.
- `findConsultationsOf(userId)`: finds staff reads of the person's records within `NODE_AUDIT_RETENTION_DAYS`. It calls `consultationsOf` with the `STAFF_READ_PURPOSES` keys and maps each row's action to its purpose text.
- `auditLogService` (exported): `{ record, search, searchIncidents, findOwnAuditEntries, findConsultationsOf }`.

## Relationships
- `src/modules/audit-logs/repository.ts`: all data access goes through `auditLogRepository` (`create`, `search`, `sinceScope`, `ownOrderScope`, `ownEntriesPage`, `consultationsOf`), plus `AUDIT_SORT` and the filter and cursor types.
- `src/modules/audit-logs/module.ts`: registers `record` as the audit sink in its `onRegistered` hook. The sink type comes from `src/infrastructure/observability/audit.ts`.
- `src/modules/audit-logs/controllers/get-audit.ts`: the read-path consumer, serving the `GET` endpoints described above.
- `src/modules/audit-logs/presenter.ts`: supplies `presentIncidentEntry`.
- `src/modules/audit-logs/metrics.ts`: supplies `auditSinkFailuresTotal`.
- `src/modules/audit-logs/config.ts`: supplies `NODE_AUDIT_RETENTION_DAYS` through `auditLogsConfig()`.
- `src/modules/audit-logs/model.ts`: supplies `AuditLogDocument`, used to cast the entry in `record`.
- `src/modules/access/index.ts`: supplies `SHOP_REFUSAL_REASONS`, used to exclude the shop's own rank refusals from the operator view.
- `src/kernel/staff-read.ts`: supplies `STAFF_READ_PURPOSES`, which defines which actions count as consultations and their purpose text.
- `src/domain-primitives/time.ts`: supplies `DAY_MS`, used to compute the retention window.
- `src/infrastructure/adapters/logger.ts`: used for the failure warning in `record`.
- `src/infrastructure/persistence/create-repository.ts`: supplies the `PaginatedResult` type.

## Notes
- The failure handling is deliberately asymmetric. `record` fails open because the compliance record is the audit logger, which has already written the entry. The read functions propagate errors.
- The operator allow-list is explicit by design. Prefix matching alone would be wrong, because failed logins sit under `auth.*` and `system.user.*` carries customer ids. `security.unauthorized` is not stored, so no 401s appear.
- `findOwnAuditEntries` returns only the caller's own rows, to avoid leaking other actors' data (GDPR Art. 15).
- Consultations are limited by retention. Guests have no `subjectId`, and the orders CSV export names no person. The file calls both stated limits, not gaps.
- `// Stryker disable/restore` comments wrap the logger call, excluding it from mutation testing.
