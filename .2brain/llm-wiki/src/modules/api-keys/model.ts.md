---
source: src/modules/api-keys/model.ts
sha256: ab3d727e9d91ebcad322aad510c7b467310fd0e7bc420f4bc21dc3bb77b49092
generated_at: 2026-10-14T14:58:44.167463+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/model.ts

## Purpose

Defines the Mongoose schema, document type, and registered model for the `apikeys` collection. It is the single source of truth for the shape of a machine-to-machine credential record and enforces the core security invariant that only a SHA-256 `hash` (never the raw secret) is persisted.

## Key elements

- **`ApiKeyDocument`** – Mongoose `Document` interface describing every field on an API-key record (tenant, name, publicPrefix, hash, permissions, createdByUserId, lastUsedAt, expiresAt, revokedAt, timestamps).
- **`ApiKeyModel`** – Convenience type alias `Model<ApiKeyDocument>` for use in generics.
- **`apiKeySchema`** – The `Schema` instance. Notable validation/constraints:
  - `tenant` is lowercased, trimmed, and required.
  - `publicPrefix` is required and **unique** (enforces unambiguous lookup in `findActiveByPrefix`).
  - `permissions` must be a non-empty string array.
  - `expiresAt` is required (bounded to one year by the service layer).
  - Compound index `{ tenant: 1, createdAt: -1 }` supports the admin list query.
- **`applyApiKeyTransform`** – A serialization transform (built via `applySerialization`) that maps `_id → id` and **omits** `tenant`, `hash`, and `createdByUserId` from the wire shape.
- **`apiKeyModel`** – The registered Mongoose model (`model('ApiKey', apiKeySchema)`); the single entrypoint consumers use to query the collection.

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** – Imports `applySerialization` to construct `applyApiKeyTransform`.
- **`src/modules/api-keys/index.ts`** – Module barrel; re-exports the model and related types outward.
- **`src/modules/api-keys/repository.ts`** / **`services/api-keys.ts`** / **`services/resolver.ts`** – Consume `apiKeyModel` for reads and writes (e.g., lookups by `publicPrefix`, listing by `tenant`).
- **`src/modules/api-keys/presenter.ts`** – Renders the wire shape produced by `applyApiKeyTransform`.
- **`src/modules/api-keys/tests/unit/schema-contract.test.ts`** – Asserts the schema's field contracts and validation rules.

## Notes

- `hash` is deliberately excluded from the serialization transform; any code path that serializes a document **must** go through `applyApiKeyTransform` to avoid leaking the digest.
- `tenant` is also omitted from the wire shape because the caller's own identity already implies tenancy; the field still exists in the DB for query scoping.
- The `tenant` field here is an **organisation identifier**, distinct from the translation-keyspace "tenant" in `locales/model.ts` (see `docs/theory/tenancy.md`).
- `publicPrefix` uniqueness is a correctness requirement, not merely an optimization: duplicate prefixes would make credential verification ambiguous.
