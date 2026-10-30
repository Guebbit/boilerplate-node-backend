---
source: src/modules/audit-logs/openapi.yaml
sha256: 375cabd5bf5d76198eeee68132966615db9c68afd49c9561e38e98238f85f56f
generated_at: 2026-10-29T03:17:33.115577+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the audit-logs module. It defines the shop-scoped `GET /audit` endpoint, the shared `AuditEntryItem` row schema (also referenced by the platform observability endpoint and the account export), and the module's contribution to `AccountExportResponse`.

## Key elements

- **`GET /audit`** (`operationId: listAuditEntries`) — Paged, newest-first read of the shop's action trail. Filters: `actor`, `action`, `outcome`, `target`, `since` (exclusive), `ownOrder`, plus shared `page`/`pageSize`. Requires `read:AuditLog`; accepts `bearerAuth` or `apiKeyAuth`.
- **`x-personal-data.auditLog`** — Extension that registers this module's section in the `POST /account/export` bundler. Removing the module removes the section.
- **`AuditEntryItem`** — The single row shape shared by `GET /audit`, `GET /observability/audit`, and the account export. Required fields: `actorUserId`, `actorRole`, `actorScope`, `action`, `outcome`, `timestamp`, `level`. Notable optional fields: `actorCredentialId`, `actorRoleName`, `ip`, `userAgent`, `requestId`, `traceId`, `targetType`, `targetId`, `metadata`.
- **`AuditEntriesResponse`** — Wrapper with `items` (array of `AuditEntryItem`) and `meta` (`PaginationMeta` from shared contracts).
- **Tag `Audit`** — Distinguishes shop-facing audit from platform Observability audit.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — Imported for:
  - `components/parameters/PageParam` and `PageSizeParam` (pagination query params on `GET /audit`)
  - `components/responses/Unauthorized`, `Forbidden`, `ValidationError` (error responses)
  - `components/schemas/PaginationMeta` (the `meta` object in `AuditEntriesResponse`)

## Notes

- **One serializer, three callers.** `AuditEntryItem` is the single row shape for `GET /audit`, `GET /observability/audit`, and the account export. A single serializer (`applyAuditLogTransform`) handles all three; the platform trail answers a keyed HMAC digest for `ip` while the shop trail returns the raw address.
- **`metadata` is deliberately open.** `additionalProperties: true` because each action adds its own keys; a closed schema would break generated validation.
- **`changedFields` stores names only, never values.** Because the trail is never scrubbed on data-erasure requests, personal/free-text field values are excluded by design.
- **`since` is an exclusive bound.** Events *strictly after* the given timestamp are returned.
- **`ownOrder` filter** reads from `metadata.ownOrder`; absent value means "keep both."
- **No `sort` param.** The trail is a log — always newest first.
