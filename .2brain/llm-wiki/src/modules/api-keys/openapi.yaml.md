---
source: src/modules/api-keys/openapi.yaml
sha256: 3f697def407089949cfb1cc9a32b1afc9ce2b062e4dcbaea55b0187d2c73d6d4
generated_at: 2026-09-23T18:24:48.734885+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/openapi.yaml

## Purpose

OpenAPI 3.0.3 contract for the api-keys module. Defines the three machine-to-machine credential endpoints (list, mint, revoke), their request/response schemas, and the envelope wrappers that the module's runtime must produce.

## Key elements

- **`GET /api-keys` (`listApiKeys`)** — paginated list of a shop's credentials. Never returns a secret; only the `publicPrefix` identifier.
- **`POST /api-keys` (`mintApiKey`)** — creates a credential and returns the plaintext `sk_<prefix>_<secret>` exactly once (201).
- **`DELETE /api-keys/{id}` (`revokeApiKey`)** — soft-revokes by stamping `revokedAt`; row and audit history remain readable.
- **`ApiKey`** — the credential shape as it appears in list/detail (no secret field).
- **`ApiKeyCreated`** — superset of `ApiKey` with the one-time `secret` field. Declared flat (not `allOf`) to avoid an ajv `additionalProperties: false` collision.
- **`MintApiKeyRequest`** — body for mint: `name`, `permissions` (non-empty, must be ⊆ caller's current permissions), optional `expiresAt`.
- **`ApiKeysResponse` / `ApiKeysResponseEnvelope`** — paginated list payload and its `success/status/message/data` envelope.
- **`ApiKeyCreatedEnvelope`** — 201 response envelope wrapping `ApiKeyCreated`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — the primary dependency. Every common parameter (`PageParam`, `PageSizeParam`, `IdPathParam`), standard error response (`Unauthorized`, `Forbidden`, `ValidationError`, `InternalError`, `Success`, `NotFound`), and primitive schema (`Id`, `PaginationMeta`, `EnvelopeSuccess`, `EnvelopeStatus`, `EnvelopeMessage`) is `$ref`-ed from this file. This file never redefines those.
- **`src/modules/api-keys/module.ts`** — the runtime module that implements the paths and schemas defined here; this spec is its external contract.

## Notes

- **Flat `ApiKeyCreated` is intentional.** The comment explicitly warns that `allOf: [ApiKey, {secret}]` with two `additionalProperties: false` branches causes ajv to reject valid payloads. Do not "clean up" to `allOf` without re-testing validation.
- **Secret is single-use in the API surface.** The description on `POST` and the `ApiKeyCreated.secret` field make clear the secret appears in exactly one HTTP response; every other endpoint omits it.
- **Permission floor is enforced at request time, not just mint time.** The `ApiKey.permissions` description and the `POST` description both state the floor is re-checked against the minter's _current_ permissions on every subsequent request.
- **Revoke ≠ delete.** `DELETE /api-keys/{id}` is a state transition (`revokedAt` stamp), not a row removal. The 200 response is the shared `Success` envelope, not a body containing the credential.
- All schemas set `additionalProperties: false`; any new field added to the API must update the schema here before implementation.
