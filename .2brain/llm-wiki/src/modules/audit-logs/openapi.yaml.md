---
source: src/modules/audit-logs/openapi.yaml
sha256: 9c0b91625a03ccd7fab604a9cb514aca3c4000735fcce71d1bbfeebb41b3f361
generated_at: 2026-11-14T19:24:51.046779+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/openapi.yaml

## Purpose

OpenAPI 3.1.0 module contract for the **audit-logs** module. Defines the shop-facing read-only audit trail endpoint (`GET /audit`), the shared `AuditEntryItem` row schema, the GDPR Art. 15 consultation-history schemas, and declares this module's contribution to the account data export (`x-personal-data`).

## Key elements

- **`GET /audit`** — Paged, newest-first list of a shop's action history. Filterable by `actor`, `action`, `outcome`, `target`, `subject`, `since` (exclusive lower bound), and `ownOrder`. Requires `read:AuditLog` via bearer or API key.
- **`AuditEntryItem`** — The single row shape used by `GET /audit`, `GET /observability/audit`, *and* the account export. Carries actor identity, scope (`tenant`/`platform`), action, outcome, optional IP/userAgent/requestId/traceId, target/subject IDs, a deliberately open `metadata` object, timestamp, and level.
- **`AuditConsultations` / `AuditConsultation`** — GDPR Art. 15 "who looked at your data" list for the personal-data export. Deliberately omits the staff member's identity (CJEU C-579/21). Bounded by `windowDays` (= `NODE_AUDIT_RETENTION_DAYS`).
- **`AuditEntriesResponse`** — Standard `{ items, meta }` wrapper referencing the shared `PaginationMeta`.
- **`x-personal-data`** — Extension that the export bundler reads to splice `auditLog` and `consultations` sections into `AccountExportResponse`. Removing the module removes these sections.
- **Tag `Audit`** (`x-family: Core`) — Groups the operation; described as the shop's action history, distinct from Observability's platform-operator audit.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — `$ref`s its shared `PageParam`, `PageSizeParam` parameters, `Unauthorized`/`Forbidden`/`ValidationError` responses, and the `PaginationMeta` schema. This is the only cross-file reference in this contract.

## Notes

- `AuditEntryItem` is the *single* serializer target (`applyAuditLogTransform`) for three different consumers; schema changes ripple to all three.
- `metadata` is `additionalProperties: true` on purpose — each action adds its own keys and a closed object would break the generated validator. Fixed-meaning keys documented inline: `ownOrder`, `changes` (non-personal field diffs with `{from, to}`), `changedFields` (personal/free-text fields by **name only**; values never enter the trail).
- The platform trail returns a keyed digest for `ip` (`hmac:` + 12 hex chars); this shop-facing endpoint returns the raw caller address.
- The `subject` filter answers "who looked at this person's data." Only staff reads of a person's record carry `subjectId`; guest orders and non-person actions do not.
- `AuditConsultations` is bounded by retention (`windowDays`); the orders CSV export names no person.
- `since` is a **strictly exclusive** lower bound (events *after* the timestamp, not including it).
