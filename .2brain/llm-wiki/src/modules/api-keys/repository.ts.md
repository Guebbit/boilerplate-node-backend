---
source: src/modules/api-keys/repository.ts
sha256: 45e4125de6b00b08d80fedba472a96b7468bd2ebe26068c4cb1c1e38f1da7efe
generated_at: 2026-10-29T03:14:08.043567+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/repository.ts

## Purpose

Repository for the `apikeys` Mongoose collection. Wraps the generic CRUD factory with a small set of domain-specific queries that the shared factory cannot express — primarily the credential-resolve path's active/any-state lookups by public prefix, plus bulk revocation and user-scoped cleanup.

## Key elements

- **`StoredApiKey`** – Wire shape (`Omit<ApiKey, 'status' | 'actions'>`). The `status` field (whether the minter can still sign in) belongs to another collection and is added downstream by `services/api-keys.ts`.
- **`base`** – Generic CRUD from `createRepository`, configured with `applyApiKeyTransform` and sortable fields (`createdAt`, `expiresAt`, `lastUsedAt`). No free-text search filter.
- **`findActiveByPrefix(publicPrefix)`** – Returns one active credential or `null`. Filters `revokedAt: null` and a non-past `expiresAt` in the query itself, so a dead key fails identically to a non-existent one.
- **`findAnyByPrefix(publicPrefix)`** – Same prefix lookup in *any* state (revoked, expired). Intended only for building the "why did the active lookup miss" error message; never for authentication.
- **`touchLastUsed(id)`** – Fire-and-forget `$set: { lastUsedAt }`. Never awaited on the resolve path; a lost update costs only a stale "last used" display.
- **`deleteByUserId(userId, session?)`** – `deleteMany` on `createdByUserId`. Accepts an optional Mongoose session for transactional hard-deletes.
- **`findActiveByMinter(userId)`** – All credentials the user minted that are neither revoked nor expired.
- **`revokeMany(ids, at)`** – `updateMany` guarded by `revokedAt: null`, making it idempotent: `revokedAt` is set exactly once, to the first revocation time.
- **`mintersOf(ids)`** – Projects `createdByUserId` for the given ids and returns a `Map<credentialId, userId>`.
- **`apiKeyRepository`** – The exported object: `{ ...base, findActiveByPrefix, findAnyByPrefix, touchLastUsed, deleteByUserId, findActiveByMinter, revokeMany, mintersOf }`. Explicitly annotated with an intersection type to satisfy TS7056 (same pattern as `webhooks/repository.ts`).

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** – Supplies `createRepository` and the `Repository` type; provides all standard CRUD (`find`, `create`, `update`, `delete`) that `base` exposes.
- **`src/modules/api-keys/model.ts`** – Supplies the Mongoose model (`apiKeyModel`), the document type (`ApiKeyDocument`), and the projection transform (`applyApiKeyTransform`) used by both the factory and every direct query in this file.
- **`src/types/index.ts`** – Source of the `ApiKey` domain type from which `StoredApiKey` is derived.
- **`src/modules/api-keys/services/api-keys.ts`** – Consumes `apiKeyRepository`; reads rows and enriches them with the minter's `status` before returning (the repository intentionally omits it).
- **`src/modules/api-keys/services/resolver.ts`** – The credential-resolve path that calls `findActiveByPrefix` / `findAnyByPrefix` and fires `touchLastUsed`.
- **`src/modules/api-keys/services/actions.ts`** – Admin/mint action layer that calls `revokeMany`, `mintersOf`, `findActiveByMinter`, and `deleteByUserId`.
- **`src/modules/api-keys/presenter.ts`** – Shapes the `StoredApiKey` rows for the response layer.
- **Integration tests** (`api-keys.test.ts`, `outcomes.test.ts`, `sessions-revoked-outbox.test.ts`, `security-events.test.ts`) – Exercise the repository's query paths end-to-end against a real Mongo instance.

## Notes

- `createdByUserId` is stored as a plain string (never converted to ObjectId), so all queries match it as a raw string.
- `revokedAt: null` in Mongo matches both explicitly-null and absent fields; no `$exists` clause is needed.
- `revokeMany` is intentionally idempotent — concurrent revocations of the same key will not shift `revokedAt`.
- The explicit intersection-type annotation on `apiKeyRepository` is a TS workaround (TS7056) shared across all module repositories, not a special semantic choice.
