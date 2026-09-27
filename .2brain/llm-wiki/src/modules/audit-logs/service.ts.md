---
source: src/modules/audit-logs/service.ts
sha256: d5486b9a909ce31d9de7dea1c861189edb1ba30c18f2f766530144f6bbfb1f22
generated_at: 2026-09-27T14:43:16.726872+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/service.ts

## Purpose

The audit-log service. It is the persistence sink that the observability audit module calls when an entry is emitted, and the read path behind two HTTP endpoints: `GET /observability/audit` (platform operator) and `GET /audit` (tenant staff, gated on `audit.any.read`). It sits between the domain model/repository and the controllers, applying collection-specific policies (scope, sort, pagination) that don't belong in the generic repository.

## Key elements

- **`record`** (internal, not individually exported) — Stores a single `AuditEntry` via `auditLogRepository.create`. Fail-open by design: returns `void`, swallows all errors into a `logger.warn` line and an `auditSinkFailuresTotal` increment. The `.catch()` prevents an unhandled rejection from taking the process down. Registered as the `AuditSink` by `module.ts` at import time.
- **`search`** (exported) — Reads one filtered page of audit entries, newest first. Applies `sinceScope` and `AUDIT_SORT` on top of the repository's base `search`. `meta.totalItems` reflects all matching entries, not just the page. Rejections propagate to the caller.
- **`findOwnAuditEntries`** (exported) — Returns every audit entry for a single `userId` (actor-only), unpaginated. Built on `readAll` + `search` with `MAX_CONFIGURED_PAGE_SIZE`. Intended for the caller's own data export (GDPR Art. 15); must not leak other actors' rows.
- **`auditLogService`** (exported) — Barrel object exposing `{ record, search }` for consumers that don't need `findOwnAuditEntries`.

## Relationships

- **`./repository`** — Primary data access. Uses `auditLogRepository.create`, `.search`, `.sinceScope`, and the `AUDIT_SORT` constant.
- **`@infrastructure/observability/audit`** — Supplies the `AuditEntry` type; this file's `record` is the `AuditSink` implementation that module registers.
- **`./model`** — `AuditEntry` is cast to `Partial<AuditLogDocument>` at the persistence boundary in `record`.
- **`@types`** — `AuditEntryItem` is the item type returned by `search` and `findOwnAuditEntries`.
- **`./metrics`** — `auditSinkFailuresTotal` counter is incremented on every failed write.
- **`@infrastructure/adapters/logger`** — `logger.warn` is the sole error channel in `record`.
- **`@infrastructure/persistence/search`** — Provides `readAll` (cursor-free pagination loop) and `MAX_CONFIGURED_PAGE_SIZE` used by `findOwnAuditEntries`.
- **`@infrastructure/persistence/create-repository`** — Source of the `PaginatedResult` type.
- **`module.ts`** — Registers `auditLogService.record` as the active audit sink at import time.
- **`controllers/get-audit.ts` / `controllers/get-observability-audit.ts`** — Consume `search` and/or `findOwnAuditEntries` to answer their respective HTTP routes.
- **`tests/unit/service.test.ts`** — Unit tests for all three functions.

## Notes

- `record` is deliberately `void`, not `Promise<void>`. Callers should not `await` or `.then()` it; the floating `void` + `.catch()` pair is the contract.
- The write path is fail-open; the read path is fail-closed. Do not "symmetrize" them — a lost write degrades the dashboard, a failed read is a 500 to the operator.
- `record` is not exported on its own; it is only reachable through `auditLogService.record`. Direct imports of the module for `record` will not type-check.
- Stryker suppression is placed around the `logger.warn` call in `record` to prevent mutation-testing noise on the error-handling path.
