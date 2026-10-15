---
source: src/modules/audit-logs/openapi.yaml
sha256: 890b3cede4e577d5483ee99416d1380e024323308d7052e6c55c9d0409948b9a
generated_at: 2026-10-15T10:22:02.234971+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the **audit-logs** module. It defines the tenant-facing endpoint `GET /audit` (a shop's own action history), the shared `AuditEntryItem` row schema, and registers the module's slice of the account data export. It is the machine-readable API spec that documents and constrains what the module exposes to tenants.

## Key elements

- **`GET /audit`** (`listAuditEntries`) — paged, filterable read of a shop's action trail (newest first). Filters: `actor`, `action`, `outcome`, `target`, `since` (exclusive lower bound), plus shared `PageParam` / `PageSizeParam`. Requires `audit.any.read` (held by `manager`, `support`, `moderator`). Accepts `bearerAuth` or `apiKeyAuth`.
- **`AuditEntryItem`** — the single row schema for every audit read surface. Carries actor identity (`actorUserId`, `actorRole`, `actorRoleName`, `actorScope`, optional `actorCredentialId`), the action (`action`, `outcome`, `level`), context (`ip`, `userAgent`, `requestId`, `traceId`, `targetType`, `targetId`, `timestamp`, free-form `metadata`).
- **`AuditEntriesResponse`** — `{ items, meta }` paginated list wrapper around `AuditEntryItem[]`.
- **`AuditEntriesResponseEnvelope`** — standard `{ success, status, message, data }` envelope wrapping `AuditEntriesResponse`.
- **`x-personal-data.auditLog`** — declares the module's contribution to `POST /account/export`; removing the module removes this section from the export.
- **Tag `Audit`** — namespacing for this module's operations.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — this file `$ref`s six definitions from the root contract:
  - Parameters: `PageParam`, `PageSizeParam`
  - Responses: `Unauthorized` (401), `Forbidden` (403), `ValidationError` (422), `InternalError` (500)
  - Schemas: `PaginationMeta`, `EnvelopeSuccess`, `EnvelopeStatus`, `EnvelopeMessage`

  The module spec is therefore a fragment that must be resolved against the root spec to be valid on its own.

## Notes

- **Shared row shape, three consumers.** `AuditEntryItem` is the single schema referenced by `GET /audit`, `GET /observability/audit`, and the account export. One serializer (`applyAuditTransform`) handles all three, so schema changes here affect every surface.
- **`ip` field is context-sensitive.** In this tenant-facing endpoint the raw IP is returned. In the platform-facing observability trail the same field carries an HMAC digest (`hmac:` + 12 hex chars) instead. The schema here documents the tenant variant.
- **Optional actor fields.** `actorCredentialId` is absent when a person acted directly (no API key); `actorRoleName` is absent when no tenant role resolved for the request.
- **`since` is exclusive.** The `since` filter returns entries *strictly after* the given timestamp.
- **`meta.totalItems`** reflects the full filtered count, not just the current page size.
- **Security is dual-mode.** Both `bearerAuth` and `apiKeyAuth` are listed as acceptable schemes for this operation.
