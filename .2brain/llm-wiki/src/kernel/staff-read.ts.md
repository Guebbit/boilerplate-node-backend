---
source: src/kernel/staff-read.ts
sha256: e7e31d64bd71b6cdbf5a0a5799c0a419f80cece460cf1332e510bce900c4e7e8
generated_at: 2026-11-14T18:24:25.684110+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/staff-read.ts

## Purpose

Records an audit entry (`admin.<resource>.viewed`) when a staff member opens another person's record in a detail view. It enforces two filters before writing: the caller must hold the resource's wide-read rule, and a session caller reading their own record is skipped. It is the single point at which "who looked at my data" events are captured, feeding the GDPR Art. 15 export.

## Key elements

- **`StaffReadTarget`** (interface) — describes one staff read: the permission key identifying "staff", the `AuditAction` to log, the resource kind/id, and an optional `subjectId` (the person whose data the record holds).
- **`STAFF_READ_PURPOSES`** (const) — maps each `admin.*.viewed` action to a human-readable purpose string (e.g. `"handling your order"`). Serves double duty as the registry of actions that count as a data-subject consultation; a new action not listed here never reaches the audit-logs export.
- **`recordStaffRead(request, target)`** (function) — the entry point called by detail-view controllers. Returns early if the caller lacks `target.key` in their held rules, or if a session caller is reading their own record (`credentialId === undefined` && `subjectId === caller.id`). Otherwise delegates to `recordAudit` with outcome `'success'`.

## Relationships

- **`src/kernel/ability.ts`** — `heldRules(caller)` is used to check whether the caller holds the wide-read key before recording.
- **`src/kernel/permissions.ts`** — provides the `PermissionRuleId` type that this file imports for typing the permission key.
- **`src/infrastructure/http/request.ts`** — `callerContextOf(request)` extracts the caller context passed into `recordAudit`.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` writes the entry; `AuditAction` types the action field.
- **Detail-view controllers** (`get-order`, `get-user`, `get-return`, `get-task`, `get-order-invoice`, `get-order-credit-note`) — each calls `recordStaffRead` after a successful detail fetch to register the consultation.
- **`src/modules/audit-logs/service.ts`** — consumes the stored entries (keyed by `subjectId`) to answer "who looked at my data" queries.

## Notes

- **Detail reads only.** List/index endpoints are deliberately excluded; a list would emit one entry per page, and the meaningful event is the one naming a specific record.
- **Self-read nuance.** A key carries its minter's id but is *not* the minter. The guard checks `credentialId === undefined` (i.e. a session, not a key) so that a key reading its own minter's record **is** recorded — only a true session reading itself is suppressed.
- **`subjectId` is optional.** Absent for guest orders and any record that does not belong to a person; the audit row simply omits the column, which keeps the "who looked at *my* data" query to `WHERE subjectId = :id`.
- **Extending the set of consultations.** Adding a new `admin.<resource>.viewed` action requires a matching entry in `STAFF_READ_PURPOSES`; without it the action is logged but invisible to the data-subject export.
