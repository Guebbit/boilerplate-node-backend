---
source: src/modules/api-keys/openapi.yaml
sha256: 40273072fe2d620d7595c02aa117cbbf2b6b728d5aaf7bdd534e203a88c96aa2
generated_at: 2026-11-08T05:03:13.751027+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/openapi.yaml

## Purpose

OpenAPI 3.1.0 module contract defining the machine-to-machine credential API (list, mint, get, revoke) for the `api-keys` module. It specifies the REST surface, request/response schemas, sorting grammar, and the module's section of the account data export, serving as the single source of truth for both implementation and client codegen.

## Key elements

- **Paths**
  - `GET /api-keys` (`listApiKeys`) — paginated, sortable list of credentials; never exposes secrets.
  - `POST /api-keys` (`createApiKey`) — mints `sk_<prefix>_<secret>`; secret returned exactly once; requires critically fresh session, non-empty permission subset of caller's current permissions, and `expiresAt` ≤ 1 year ahead.
  - `GET /api-keys/{id}` (`getApiKey`) — single credential detail; secret never included.
  - `DELETE /api-keys/{id}` (`revokeApiKey`) — soft-revoke (stamps `revokedAt`); row and audit history remain readable.

- **Schemas (components)**
  - `ApiKeySort` — JSON:API-style sort grammar (1–3 fields, `-` prefix for descending); ties broken by `id`.
  - `ApiKeyStatus` — server-decided enum: `active | expired | revoked | suspended`; `suspended` is transient (tied to minter's account state).
  - `ApiKey` — full credential object including `publicPrefix`, `permissions`, `actions`.
  - `ApiKeyActions` — per-caller capability flags (currently `revoke: boolean`).
  - `ExportApiKey` — `ApiKey` minus `actions`; used in the account data export.
  - `CreateApiKeyRequest`, `ApiKeysResponse`, `ApiKeyCreated` — request/response envelopes (truncated in view).

- **Extensions**
  - `x-personal-data.apiKeys` — declares this module's slice in `POST /account/export`; the bundler merges it into `AccountExportResponse`.
  - `x-error-codes` on `createApiKey` — `401: [REAUTH_REQUIRED]`.
  - Tag `ApiKeys` carries `x-family: Core`.

## Relationships

- **shared/contracts/openapi.root.yaml** — Referenced via relative `$ref` for shared parameters (`PageParam`, `PageSizeParam`, `IdPathParam`), standard error responses (`Unauthorized`, `Forbidden`, `ValidationError`, `NotFound`, `NoContent`), the `Location` header, and the `Id` schema. Removing or renaming any of these breaks this file.
- **src/modules/audit-logs/openapi.yaml** — The revoke endpoint's description notes that audit history for a revoked key remains readable, implying the audit-logs module exposes entries for this module's mutations. No direct `$ref` coupling visible here.
- **src/modules/cart/openapi.yaml** — Graph neighbor; no direct reference or shared schema is visible in this file. Interaction is likely at the bundler/aggregation level only.

## Notes

- The secret (`sk_…`) appears **only** in the `201` response of `POST /api-keys`; every other endpoint omits it by design.
- `suspended` status is checked *after* `revoked`/`expired`, so a revoked key will never read as `suspended` even if the minter is also banned.
- Permissions are re-floored against the minter's **current** tenant permissions on every authenticated request, not just at mint time. A key whose minter is banned/erased is refused with `401` until the minter is restored.
- `DELETE /api-keys/{id}` is a state transition, not a row deletion; the row persists for audit purposes.
- The `x-personal-data` block intentionally excludes `actions` (caller-specific) and the secret; `publicPrefix` is included so an account can identify which key is which.
- Sorting uses a single shared grammar (see `docs/api/sorting.md` referenced in the file); the sort array is capped at 3 entries.
