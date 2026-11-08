---
source: src/kernel/staff-read.ts
sha256: df0f2dacb34ef15ca2f1551d8f919582ccbf3acdf920219482ae4ea6ab7bb6e6
generated_at: 2026-11-08T03:55:17.353275+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/staff-read.ts

## Purpose

Records a single audit entry (`admin.<resource>.viewed`) whenever a staff member reads **another** person's record in detail. It is deliberately a no-op for self-reads and for callers without the resource's wide-read permission, so that ordinary customer self-service traffic never generates audit noise.

## Key elements

- **`StaffReadTarget`** (interface) — Describes what one staff read names: the permission key that identifies "staff" for the resource (`display:<Subject>` / `read:<Subject>`), the audit action string, the resource type, the record id, and optionally the owner id.
- **`recordStaffRead(request, target)`** (function) — The sole call site. Guards on (1) caller holds `target.key` per `heldRules` and (2) `target.ownerId !== caller.id`. If both pass, delegates to `recordAudit` with a `success` outcome.

## Relationships

- **`@kernel/ability`** — `heldRules(caller)` is used to check whether the caller possesses the wide-read permission key.
- **`@kernel/permissions`** — Provides the `PermissionRuleId` type for `StaffReadTarget.key`.
- **`@infrastructure/http/request`** — `callerContextOf(request)` extracts the audit context (actor, IP, etc.) for the audit entry.
- **`@infrastructure/observability/audit`** — `recordAudit` is the final sink that persists the event; `AuditAction` type is reused.
- **Controllers** (`get-order`, `get-user`, `get-task`, `get-return`, `get-order-invoice`, `get-order-credit-note`) — Each calls `recordStaffRead` after resolving the record, passing the relevant key, action string, type, id, and owner id.

## Notes

- **Detail reads only.** The doc comment explicitly states this is not intended for list endpoints; a list would emit one audit row per page. Callers must only invoke this from single-record GET handlers.
- **`ownerId` is optional.** When omitted the self-read guard is skipped, which is appropriate for resources that have no distinct owner (e.g. a task). Pass `undefined` intentionally in that case.
- **No-throw contract.** The function never throws; permission or ownership mismatches simply result in no audit entry being written.
- **`request` must already be past `getAuth`.** The function assumes `request.caller` is populated; it does not authenticate or authorise.
