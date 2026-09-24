---
source: src/modules/audit-logs/openapi.yaml
sha256: b21447300f7d86a5c6c96b9ab6a739a1269fb0ce4f2be7887b39ba6ac0180923
generated_at: 2026-09-23T18:27:12.953568+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/openapi.yaml

## Purpose

OpenAPI 3.0.3 contract for the **audit-logs** module. It declares the single `GET /audit` endpoint (shop-scoped, role-gated action history) and the component schemas that endpoint—and the shared `POST /account/export` route—reference. It exists so consumers and code-gen tools have a machine-readable, module-local contract without reaching into another module's spec.

## Key elements

- **`GET /audit`** — Filtered, paged list of audit entries for the current shop. Supports query filters (`actor`, `action`, `outcome`, `target`, `since`) plus shared pagination params. Requires `audit.any.read` (held by `manager`, `support`, `moderator`).
- **`AuditEntryItem`** — Single audit row: actor identity, action name, outcome, target, timing, and diagnostic fields (`ip`, `user_agent`, `request_id`, `trace_id`, `level`).
- **`AuditEntryList`** — `items` array + `meta` (shared `PaginationMeta`).
- **`AuditEntryListResponseEnvelope`** — Standard `{ success, status, message, data }` wrapper around `AuditEntryList`.
- **`ExportAuditEntry`** — Field-for-field copy of `AuditEntryItem`, referenced by `POST /account/export` in the shared root contract. Kept as a separate named schema so the export shape can diverge independently.

## Relationships

- **→ `shared/contracts/openapi.root.yaml`** — `$ref`s for `PageParam`, `PageSizeParam`, all error responses (`401/403/422/500`), `PaginationMeta`, and the `Envelope*` sub-schemas. This is the _only_ external contract this file references.
- **← `shared/contracts/openapi.root.yaml`** (`POST /account/export`) — references `ExportAuditEntry` defined here.
- **~ `observability/openapi.yaml`** (sibling module) — Its `AuditEventItem` mirrors `AuditEntryItem` by hand, not by `$ref`. Both endpoints are served from the same collection via `auditLogRepository.search`.

## Notes

- **Module isolation rule:** This spec never `$ref`s into a sibling module's contract (e.g. observability). Cross-module sharing goes only through `shared/contracts/openapi.root.yaml`. Rationale documented in `docs/theory/module-lifecycle.md`.
- **`AuditEntryItem` vs `ExportAuditEntry`:** Deliberately duplicated, not `$ref`'d to each other. If the shapes drift, fix both.
- **`ip` / `user_agent` are raw.** Hashing seen elsewhere (`adapters/logger.ts`) applies to Winston log lines, not to this queryable collection.
- **`since` is exclusive** — returns entries strictly _after_ the given timestamp.
- **`actor_scope` and `actor_role_name`** are absent on rows recorded before those fields existed; consumers must treat them as optional.
