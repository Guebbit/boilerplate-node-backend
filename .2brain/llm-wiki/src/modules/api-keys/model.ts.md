---
source: src/modules/api-keys/model.ts
sha256: 98c18041adfab9391bb641a5b35a4e5ec7a5085bed259eb6b3d2396ebc496a2c
generated_at: 2026-10-29T03:13:16.681658+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/model.ts

## Purpose

Defines the Mongoose schema, model, and wire-shape serialization for the `apikeys` collection — one document per minted machine-to-machine credential. It is the single source of truth for the document shape and ensures the secret hash never appears in serialized output.

## Key elements

- **`ApiKeyDocument`** — Interface extending Mongoose `Document` with fields: `tenant`, `name`, `publicPrefix`, `hash`, `permissions`, `createdByUserId`, `lastUsedAt?`, `expiresAt`, `revokedAt?`, plus `timestamps`.
- **`apiKeySchema`** — Mongoose `Schema` with validations: `tenant` is lowercased/trimmed; `publicPrefix` is `unique: true` (a hard DB constraint, not just an index); `permissions` must contain ≥ 1 entry; `expiresAt` is required. Compound index `{ tenant: 1, createdAt: -1 }` supports the "newest first" admin list.
- **`applyApiKeyTransform`** — Serialization transform (built via `applySerialization`) that maps `_id` → `id` and omits `tenant`, `hash`, and `createdByUserId` from outgoing wire shapes.
- **`apiKeyModel`** — The registered Mongoose model (`model('ApiKey', apiKeySchema)`), the entrypoint other modules import for queries.
- **`ApiKeyModel`** — Type alias for `Model<ApiKeyDocument>`, exported for typing repository/service signatures.

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** — Provides `applySerialization`, which this file calls to build `applyApiKeyTransform`.
- **`src/modules/api-keys/repository.ts`** — Consumes `apiKeyModel` for CRUD and query operations.
- **`src/modules/api-keys/services/api-keys.ts`** — Uses the model to mint/revoke/list credentials.
- **`src/modules/api-keys/services/resolver.ts`** — Looks up credentials by `publicPrefix` to verify incoming requests against the stored `hash`.
- **`src/modules/api-keys/presenter.ts`** — Applies `applyApiKeyTransform` to shape documents before returning them to callers.
- **`src/modules/api-keys/index.ts`** — Barrel file; re-exports the public surface of this module.
- **`src/modules/api-keys/tests/unit/schema-contract.test.ts`** — Asserts schema fields, validators, and the serialization transform.

## Notes

- `publicPrefix` uniqueness is a **database-level** constraint (enforced by the `unique` index), not merely a validation rule. Two keys sharing a prefix would make prefix-based resolution ambiguous.
- The `hash` field is a sha256 digest (produced by `./credentials`, not defined here). The serialization transform guarantees it is stripped before any document leaves the module.
- `tenant` follows the same convention as `webhooks/model.ts` (lowercased, trimmed, required).
- Collection name is `apikeys` (lowercase, no hyphen) — set implicitly by Mongoose from the model name `ApiKey` with `autoIndex` defaulting off in production; the `unique` constraint still creates the index.
- `expiresAt` is **always** required at the schema level; the service layer additionally caps it at one year.
