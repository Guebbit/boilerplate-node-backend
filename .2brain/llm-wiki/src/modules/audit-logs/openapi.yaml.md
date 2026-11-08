---
source: src/modules/audit-logs/openapi.yaml
sha256: 784e768e6d888935cb394a711462d0f502c7617cde64459635e390a57d349b69
generated_at: 2026-11-08T05:08:37.992259+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/openapi.yaml

## Purpose

OpenAPI 3.1 contract for the audit-logs module. It defines the single shop-scoped read endpoint (`GET /audit`), the shared `AuditEntryItem` row shape, and the `x-personal-data` extension that lets the account-export bundler include audit entries in `POST /account/export`. It is the machine-readable specification that `module.ts` implements and that codegen tooling consumes.

## Key elements

- **`tags[Audit]`** — Module tag (`x-family: Core`). Distinguishes shop-facing audit from platform-facing Observability audit.
- **`x-personal-data.auditLog`** — Declares the audit-logs section of the account data export; the bundler merges it into `AccountExportResponse`. Removing this key removes the section from exports.
- **`GET /audit` (`listAuditEntries`)** — Filtered, newest-first, paged read of a shop's action history. Accepts query filters: `actor`, `action`, `outcome`, `target`, `since` (exclusive lower bound), `ownOrder`, plus shared `page`/`pageSize`. Requires `read:AuditLog`.
- **`AuditEntryItem`** — The single row shape used by `GET /audit`, `GET /observability/audit`, and the account export. Notable fields: `actorCredentialId` (API key, absent for human actors), `actorScope` (`tenant` | `platform`), `action` (dot-notation, e.g. `order.created`), `ip` (plain in shop view; HMAC digest in platform view), and an **open** `metadata` object (`additionalProperties: true`) carrying action-specific keys such as `ownOrder`, `changes`, and `changedFields`.
- **`AuditEntriesResponse`** — Paged wrapper: `{ items: AuditEntryItem[], meta: PaginationMeta }`. No `sort` field (it is a log, always newest-first).

## Relationships

- **`shared/contracts/openapi.root.yaml`** — `$ref`s for `PageParam`, `PageSizeParam`, standard error responses (`Unauthorized`, `Forbidden`, `ValidationError`), and `PaginationMeta`. All cross-module shared shapes live there; this file never re-declares them.
- **`src/modules/audit-logs/module.ts`** — Runtime implementation that serves the operations and serializes `AuditEntryItem` via `applyAuditLogTransform` (one serializer feeds all three consumers listed above).
- **`src/modules/audit-logs/authorization.yaml`** — Defines the `read:AuditLog` permission gate referenced in the operation's description.
- **`src/modules/api-keys/openapi.yaml`** — The `actorCredentialId` field in `AuditEntryItem` identifies which API key performed an action; the api-keys module is the source of those credentials.

## Notes

- `metadata` is deliberately **open** (`additionalProperties: true`). A declared-properties object would be validated closed by the generated schema, so action-specific keys are kept dynamic.
- `changes` (in `metadata`) records non-personal field diffs as `{ field: { from, to } }`; an absent side key means "was unset," never `null`. `changedFields` (string[]) records only the **names** of free-text/personal fields that changed — their values are never written to the trail, even on erasure.
- `ip` in this shop-scoped view is the plain caller address. The platform trail (`GET /observability/audit`) returns an HMAC digest (`hmac:` + 12 hex chars) instead.
- `since` is an **exclusive** lower bound (strictly after the given timestamp).
- `ownOrder` filter maps to `metadata.ownOrder === true` on the entry; absent means "keep both."
