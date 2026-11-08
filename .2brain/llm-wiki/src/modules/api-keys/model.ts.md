---
source: src/modules/api-keys/model.ts
sha256: 98c18041adfab9391bb641a5b35a4e5ec7a5085bed259eb6b3d2396ebc496a2c
generated_at: 2026-11-08T05:02:43.915554+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/model.ts

## Purpose

Defines the Mongoose schema, document interface, serialization transform, and model export for the `apikeys` collection. This is the single source of truth for the persistent shape of a minted machine-to-machine credential — the secret itself is never stored, only its sha256 digest.

## Key elements

- **`ApiKeyDocument`** – Interface describing one credential document (`tenant`, `name`, `publicPrefix`, `hash`, `permissions`, `createdByUserId`, `lastUsedAt?`, `expiresAt`, `revokedAt?`, plus timestamps).
- **`apiKeySchema`** – Mongoose `Schema` instance. Enforces `permissions` ≥ 1 entry, `unique: true` on `publicPrefix`, `timestamps: true`. Declares a compound index `{ tenant: 1, createdAt: -1 }` for the admin listing read.
- **`applyApiKeyTransform`** – Built via `applySerialization(apiKeySchema, …)`. Drops `tenant`, `hash`, and `createdByUserId` from any serialized output; renames `_id` → `id`.
- **`apiKeyModel`** – The Mongoose model entrypoint. Collection name is `apikeys`.
- **`ApiKeyModel`** – Convenience type alias (`Model<ApiKeyDocument>`) for use in function signatures.

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** – Imports `applySerialization` to construct `applyApiKeyTransform`.
- **`src/modules/api-keys/repository.ts`** – Consumes `apiKeyModel` / `ApiKeyDocument` for read and write operations against the collection.
- **`src/modules/api-keys/services/api-keys.ts`** – Mints and revokes credentials by writing documents through the model; enforces the one-year `expiresAt` bound.
- **`src/modules/api-keys/services/resolver.ts`** – Looks up a credential by `publicPrefix` (the unique index) to verify the presented key's hash.
- **`src/modules/api-keys/presenter.ts`** – Shapes `ApiKeyDocument` instances into API responses, relying on `applyApiKeyTransform` for the wire shape.
- **`src/modules/api-keys/index.ts`** – Module barrel; re-exports the public API of this file to the rest of the codebase.
- **`src/modules/api-keys/tests/unit/schema-contract.test.ts`** – Asserts the schema's field requirements, validators, and index definitions remain stable.

## Notes

- `hash` is the **only** secret-derived value persisted; the plaintext secret is never written to the database. The serialization transform guarantees it is also never serialized out.
- `publicPrefix` carries `unique: true` at the *field* level (not merely an index), because two documents sharing a prefix would make `findActiveByPrefix` ambiguous about which hash to verify.
- `createdByUserId` is omitted from serialized output by design — the audit trail exposes this via `actorUserId` in a separate concern, not as a credential field.
- `tenant` is dropped in serialization because it is implicit in the requesting context; it is still required and enforced in the schema.
