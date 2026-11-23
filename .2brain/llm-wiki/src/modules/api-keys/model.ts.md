---
source: src/modules/api-keys/model.ts
source_sha256: 015e740338453da339cb45bd7d195e637b538381835eb1f268ec91c5fcd74041
context_sha256: e8f4631dacc1595cdd996c0eef21db393fb8a12db2c427640305da281bd4bd28
generated_at: 2026-11-22T04:21:42.522294+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/api-keys/model.ts

## Purpose
Defines the Mongoose schema and model for the one collection this module owns, `apikeys`: one document per minted machine-to-machine credential. The secret itself is never stored. Only `hash` (a sha256 digest, per the module doc referencing `./credentials`) is persisted, so a database leak alone cannot forge a credential.

## Key elements
- `ApiKeyDocument`: document interface with `tenant`, `name`, `publicPrefix`, `hash`, `permissions`, `createdByUserId`, optional `lastUsedAt` and `revokedAt`, required `expiresAt`, plus `createdAt`/`updatedAt` timestamps.
- `ApiKeyModel`: `Model<ApiKeyDocument>` type alias.
- `apiKeySchema`: the schema, with `timestamps: true`.
  - `tenant` is required, lowercased and trimmed.
  - `publicPrefix` is `unique: true`. The comment says this is a database guarantee, so that `findActiveByPrefix` is never ambiguous about which hash to verify.
  - `permissions` is a `[String]` with a validator that rejects an empty array ("A credential must hold at least one permission.").
  - `expiresAt` is required. The comment says the service bounds it to a year.
- Index `{ tenant: 1, createdAt: -1 }`: serves the admin list ("this tenant's credentials, newest first").
- `applyApiKeyTransform`: the result of `applySerialization(apiKeySchema, { omit: [...] })`. It maps `_id` to `id` and omits `tenant`, `hash` and `createdByUserId` from the wire shape.
- `apiKeyModel`: the model registered as `ApiKey`, backed by the `apikeys` collection.

## Relationships
- `src/infrastructure/persistence/serialize.ts`: provides `applySerialization`, used here to build the wire-shape transform.
- Neighbors in this module (`src/modules/api-keys/repository.ts`, `src/modules/api-keys/services/api-keys.ts`, `src/modules/api-keys/services/resolver.ts`, `src/modules/api-keys/presenter.ts`, `src/modules/api-keys/index.ts`) sit on the dependency graph with this file. They consume the model and types, and the comments name `findActiveByPrefix` and the service's one-year expiry bound.
- `src/modules/api-keys/tests/unit/schema-contract.test.ts`: a unit test tied to this schema's contract.

## Notes
- The serialized output deliberately omits `hash`, `tenant` and `createdByUserId`. `tenant` is implicit in who is asking, and `createdByUserId` is carried in the audit trail as `actorUserId`.
- The `tenant` field convention mirrors `src/modules/webhooks/model.ts`.
- `lastUsedAt` and `revokedAt` are optional. All other fields are required.
