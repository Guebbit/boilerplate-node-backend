---
source: src/modules/api-keys/openapi.yaml
sha256: b5199031ac0d6a9f327338f5513a07727a2af991ec2b3f7c26a3ecd094756c11
generated_at: 2026-10-14T14:59:31.785430+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the `api-keys` module. It defines the three machine-to-machine credential operations (list, mint, revoke), the request/response schemas for each, and the `x-personal-data` extension that a bundler folds into the account data export. It exists as the single source of truth for the module's external API shape.

## Key elements

- **`GET /api-keys`** (`listApiKeys`) — Paginated listing of a shop's credentials. Never returns a secret; only `publicPrefix` and metadata.
- **`POST /api-keys`** (`mintApiKey`) — Creates a `sk_<prefix>_<secret>` credential. Returns the plaintext secret exactly once in the `201` response. Requires a critically fresh session, a non-empty `permissions` subset of the caller's own, and an `expiresAt` ≤ 1 year.
- **`DELETE /api-keys/{id}`** (`revokeApiKey`) — Soft-revokes by stamping `revokedAt`; the row and audit history remain readable. Immediate, no grace window.
- **`ApiKey`** — Core credential record (id, name, publicPrefix, permissions, timestamps). No secret field.
- **`ApiKeyCreated`** — Flat superset of `ApiKey` that adds the one-time `secret` field. Deliberately not composed via `allOf` (see Notes).
- **`MintApiKeyRequest`** — Request body: `name`, `permissions` (non-empty), `expiresAt`.
- **`ApiKeysResponse` / `ApiKeysResponseEnvelope`** — Paginated list + standard envelope.
- **`ApiKeyCreatedEnvelope`** — Standard envelope wrapping `ApiKeyCreated`.
- **`x-personal-data`** extension — Declares the `apiKeys` array (metadata only, no hash) that the bundler injects into `AccountExportResponse` for `POST /account/export`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — Referenced throughout for shared parameters (`PageParam`, `PageSizeParam`, `IdPathParam`), standard error/success responses (`Unauthorized`, `Forbidden`, `ValidationError`, `InternalError`, `NotFound`, `Success`), the `Location` header, and common schemas (`Id`, `PaginationMeta`, `EnvelopeSuccess`, `EnvelopeStatus`, `EnvelopeMessage`). All `$ref` paths are relative (`../../../shared/contracts/openapi.root.yaml#…`).
- **`src/modules/api-keys/module.ts`** — The runtime implementation this spec describes; the module registers handlers for the three `operationId`s and the `x-personal-data` export section.

## Notes

- **`ApiKeyCreated` is intentionally flat.** The in-file comment explains that composing it as `allOf: [ApiKey, {secret}]` with both branches declaring `additionalProperties: false` is an ajv validation trap: each branch is validated independently, so fields owned by the *other* branch are treated as additional properties and the document fails. The schema restates all fields rather than composing.
- **Secret visibility rule.** The `secret` field appears only in `ApiKeyCreated` (the `201` mint response). The list endpoint and `ApiKey` schema never carry it.
- **Permission re-flooring.** The `permissions` array on `ApiKey` is a snapshot at mint time; the runtime re-checks it against the minter's *current* tenant permissions on every authenticated request, not just at mint. The spec's descriptions document this but the enforcement lives in `module.ts` / middleware.
- **`x-personal-data` is bundler-driven.** This key is not standard OpenAPI; it is a convention the project's export bundler reads. Removing this module removes the corresponding section from the export response.
