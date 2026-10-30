---
source: src/modules/api-keys/openapi.yaml
sha256: 16ad4db2eec7cb45b21f2162bf90875942997288bb790fb93147a0c3b7a522e3
generated_at: 2026-10-29T03:13:42.605219+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/openapi.yaml

## Purpose

OpenAPI 3.1.0 module contract for the `api-keys` module. It declares the REST surface (list, mint, get, revoke machine-to-machine credentials), the schemas those operations use, and the module's section of the account data export. It exists so that the API spec, the `module.ts` registration, and any code-generated clients all agree on the same shapes and error semantics.

## Key elements

- **`x-personal-data`** – Custom extension that contributes an `apiKeys` array (of `ExportApiKey`) to the bundled `POST /account/export` response. The comment notes it carries metadata only (no secret, no `hash`).
- **`paths./api-keys` (GET)** – `listApiKeys`. Supports pagination via shared `PageParam`/`PageSizeParam` and a JSON:API-style `sort` query param backed by the `ApiKeySort` schema.
- **`paths./api-keys` (POST)** – `mintApiKey`. Returns `201` with a `Location` header and an `ApiKeyCreated` body that contains the one-time plaintext secret. Requires a critically fresh session (`REAUTH_REQUIRED`). Enforces `expiresAt ≤ 1 year`, non-empty permissions subset of the caller's current permissions.
- **`paths./api-keys/{id}` (GET)** – `getApiKey`. Returns a single `ApiKey`; never the secret.
- **`paths./api-keys/{id}` (DELETE)** – `revokeApiKey`. Soft state change (`revokedAt` stamped); row and audit history remain readable. Returns `204`.
- **`ApiKeyStatus`** – Enum `active | expired | revoked | suspended`. `suspended` reflects the minter's inability to sign in (banned/soft-deleted/erased); the key recovers automatically if the minter is restored.
- **`ApiKey`** – The full credential object exposed to callers, including a per-caller `actions` sub-object (currently only `revoke: boolean`).
- **`ExportApiKey`** – Same shape minus `actions` (which is caller-specific and therefore excluded from data exports).
- **`ApiKeyCreated`** – Flat (non-`allOf`) response schema for the mint call; includes the one-time `secret` field.
- **`MintApiKeyRequest`** / **`ApiKeysResponse`** – Request and list-envelope schemas (referenced but truncated in the visible content).

## Relationships

- **`shared/contracts/openapi.root.yaml`** – Heavy consumer of this file. Every 401/403/404/422 response, the `Location` header, `IdPathParam`, `PageParam`, `PageSizeParam`, and the base `Id` schema are `$ref`-ed from the shared root contract. This file contributes module-specific schemas and paths on top of that shared vocabulary.
- **`src/modules/api-keys/module.ts`** – The module registration file that mounts this OpenAPI spec (paths, components) into the running service and wires the `x-personal-data` block into the account-export bundler.

## Notes

- The secret (`sk_<prefix>_<secret>`) is **only** present in the `201` response of `mintApiKey`. No other endpoint ever returns it; the list and detail endpoints expose `publicPrefix` for identification.
- `ApiKeyActions` is server-decided and caller-specific (e.g., `revoke` is `false` for a caller lacking `delete:ApiKey` or for an already-revoked key). Because of this, it is deliberately absent from `ExportApiKey`.
- `sort` uses JSON:API grammar (`?sort=-lastUsedAt,expiresAt`); max three keys, ties broken by `id`. This is the single sort grammar shared across all list endpoints in the project.
- Permission checking is re-evaluated against the minter's **current** tenant permissions on every request the key makes, not just at mint time. The `permissions` array on `ApiKey` is the snapshot taken at mint.
- The file is truncated in the repository snapshot; `ApiKeyCreated` and `MintApiKeyRequest` schemas are incomplete here. Check the full file for their complete property lists.
