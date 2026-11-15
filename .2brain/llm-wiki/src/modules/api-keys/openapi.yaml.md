---
source: src/modules/api-keys/openapi.yaml
sha256: fe1853d555be97630d68ffbd80515ae315e1dfe2799942b87b7781e41158c815
generated_at: 2026-11-14T19:20:40.018371+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/openapi.yaml

## Purpose

OpenAPI 3.1.0 module contract for the **api-keys** module. Defines the list, get, create, and revoke endpoints for machine-to-machine credentials, their request/response schemas, and the module's contribution to the account data export via `x-personal-data`. Serves as the single source of truth for this module's HTTP surface, security requirements, and data model.

## Key elements

- **Tags** — `ApiKeys` (x-family: Core); scopes all operations under one tag.
- **`x-personal-data`** — Declarative extension the bundler merges into `AccountExportResponse`. Contributes an `apiKeys` array of `ExportApiKey` (metadata only; no secret, no `actions`).
- **`GET /api-keys`** (`listApiKeys`) — Paginated, sortable list of the shop's credentials. Never returns a secret. Requires `read:ApiKey`.
- **`POST /api-keys`** (`createApiKey`) — Mints a credential; returns the one-time plaintext secret. Requires `create:ApiKey`, a critically fresh session, a non-empty permission subset of the caller's own permissions, and `expiresAt` ≤ 1 year.
- **`GET /api-keys/{id}`** (`getApiKey`) — Single credential lookup; same secret-redaction rule as list.
- **`DELETE /api-keys/{id}`** (`revokeApiKey`) — Soft-revokes (stamps `revokedAt`); immediate, no grace period. Requires `delete:ApiKey`.
- **`ApiKeySort`** — Shared sort-grammar schema (1–3 fields from `createdAt`, `expiresAt`, `lastUsedAt`, with `-` for descending).
- **`ApiKeyStatus`** — Enum: `active`, `expired`, `revoked`, `suspended` (suspended = minter can no longer sign in; auto-recovers).
- **`ApiKey`** — Full credential object including `publicPrefix`, `permissions` (mint-time snapshot), `actions`, and timestamps.
- **`ApiKeyActions`** — Per-caller capability flags (e.g. `revoke` boolean).
- **`ExportApiKey`** — Export variant of `ApiKey` without the per-caller `actions` field.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — Heavy `$ref` dependency for shared parameters (`PageParam`, `PageSizeParam`, `IdPathParam`), responses (`Unauthorized`, `Forbidden`, `ValidationError`, `NotFound`, `NoContent`), headers (`Location`), and the `Id` schema. This file cannot be validated or consumed without the root contract.
- **`src/modules/audit-logs/openapi.yaml`** / **`src/modules/cart/openapi.yaml`** — Sibling modules in the same graph. They share the `x-personal-data` bundler pattern: each module's extension section is combined by the bundler into a single `AccountExportResponse`. Changes to the bundler contract or the root schemas in `openapi.root.yaml` affect all three files simultaneously.

## Notes

- **Secret is one-time:** The credential secret appears only in the `201` response of `createApiKey`. Every other endpoint (list, get, export) deliberately omits it.
- **Permission floor is re-evaluated live:** The `permissions` array stored on a key is a *snapshot* at mint time, but the server re-checks it against the minter's *current* permissions on every request. A key cannot outgrow its minter, even if the minter gains new permissions later.
- **`suspended` vs `revoked`:** Checked in order (revoked → expired → suspended), so a revoked key will never surface as `suspended` even if the minter is also banned.
- **Sorting grammar is JSON:API-style:** `?sort=-lastUsedAt,expiresAt` (comma-separated, `-` prefix for descending, max 3 fields, ties broken by `id`). Defined once in `ApiKeySort` and documented as shared with every list endpoint.
- **`x-error-codes` on `createApiKey`** is present but empty in the visible content — likely a placeholder or extension consumed by tooling.
- **Truncated content:** The file content provided ends mid-schema (`ExportApiKey`); additional schemas (`ApiKeysResponse`, `CreateApiKeyRequest`, `ApiKeyCreated`) are referenced but not shown.
