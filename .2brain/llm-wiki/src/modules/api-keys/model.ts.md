---
source: src/modules/api-keys/model.ts
sha256: 5e409dd62e2fc27626a90e07dbd648f78e950fccb22e1283c75142296297e8e2
generated_at: 2026-09-23T18:24:18.138372+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/model.ts

## Purpose

Defines the Mongoose schema and model for the `apikeys` collection — one document per minted machine-to-machine credential. The file is the single source of truth for the credential's shape, indexes, and wire serialization, and enforces the invariant that the secret itself is never persisted (only its sha256 hash).

## Key elements

- **`ApiKeyDocument`** – TypeScript interface extending Mongoose `Document`; declares `tenant`, `name`, `publicPrefix`, `hash`, `permissions[]`, `createdByUserId`, and optional `lastUsedAt` / `expiresAt` / `revokedAt` timestamps.
- **`ApiKeyModel`** – Convenience type alias (`Model<ApiKeyDocument>`) for use in DI and typing.
- **`apiKeySchema`** – Mongoose `Schema` instance. Notable constraints: `publicPrefix` is `unique: true` (a DB-level uniqueness guarantee, not merely an index); `permissions` must be a non-empty array. A compound index `{ tenant: 1, createdAt: -1 }` supports the "this tenant's keys, newest first" admin list.
- **`applyApiKeyTransform`** – Built via `applySerialization` from the persistence infrastructure. Renames `_id` → `id` and **omits** `tenant`, `hash`, and `createdByUserId` from any serialized output.
- **`apiKeyModel`** – The registered Mongoose model (`'ApiKey'`, collection `apikeys`). This is the entrypoint other modules consume.

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** – Provides `applySerialization`, which this file calls to build `applyApiKeyTransform`.
- **`src/modules/api-keys/repository.ts`** – Consumes `apiKeyModel` for CRUD queries (e.g. `findActiveByPrefix`).
- **`src/modules/api-keys/services/api-keys.ts`** – Orchestration layer that mints, revokes, and lists keys; depends on the schema's field contracts.
- **`src/modules/api-keys/index.ts`** / **`module.ts`** – Re-export and module wiring; consumers typically import from these rather than this file directly.
- **`src/modules/api-keys/tests/unit/schema-contract.test.ts`** – Unit-tests the schema's shape, validators, and serialization omissions.

## Notes

- **Hash-only storage:** `hash` is a sha256 digest produced in `./credentials`; the raw secret is never written to the database. The serialization layer additionally strips `hash` from every wire response as defense-in-depth.
- **Two "tenant" concepts:** The `tenant` field here is an _organisation_ identifier (same convention as `webhooks/model.ts`). It is distinct from the "tenant" in `locales/model.ts`, which refers to a translation keyspace. See `docs/theory/tenancy.md`.
- **`publicPrefix` uniqueness is a database fact:** The `unique: true` constraint (not just an index) ensures `findActiveByPrefix` can never be ambiguous about which hash to verify against.
- **`createdByUserId` is deliberately omitted from the wire:** Audit attribution travels through a separate `actor_user_id` field in the audit trail, not through this document's serialized form.
