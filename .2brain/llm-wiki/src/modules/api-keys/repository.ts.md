---
source: src/modules/api-keys/repository.ts
generated_at: 2026-11-22T04:22:44.321326+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/api-keys/repository.ts

## Purpose
Data-access layer for the `apikeys` collection. It wraps the shared repository factory's generic CRUD and adds the queries that factory has no shape for. The most important is the credential-resolve lookup, which filters revoked and expired rows in the query itself. A revoked or expired key therefore fails lookup the same way a never-minted one does.

## Key elements
- `StoredApiKey`: the wire `ApiKey` minus `status` and `actions`. `src/modules/api-keys/services/api-keys.ts` adds `status` after the read, because whether the minter can still sign in depends on another collection.
- `base`: `createRepository(apiKeyModel, …)` with `applyApiKeyTransform`. The admin list is sortable by `createdAt`, `expiresAt` and `lastUsedAt`, and has no free-text search.
- `findActiveByPrefix(publicPrefix)`: returns the single non-revoked, non-expired document for a prefix, or `null`. It filters `revokedAt: null` and `expiresAt` null or in the future.
- `findAnyByPrefix(publicPrefix)`: finds the key in any state. It exists only to explain why an active lookup missed, and must not be used to authenticate.
- `touchLastUsed(id)`: sets `lastUsedAt` to now. It is fire-and-forget from the resolve path.
- `deleteByUserId(userId, session?)`: deletes every key where `createdByUserId` matches, optionally inside a Mongo `ClientSession`. It supports hard account deletion.
- `findActiveByMinter(userId)`: returns the minter's keys that are not revoked and not expired.
- `revokeMany(ids, at)`: sets `revokedAt` only on rows where it is still `null`, and returns the modified count.
- `mintersOf(ids)`: returns a `Map` of credential id to `createdByUserId`, projecting only that field.
- `apiKeyRepository`: the exported object, which spreads `base` and adds the methods above. It has an explicit type annotation.

## Relationships
- `src/infrastructure/persistence/create-repository.ts` provides `createRepository` and the `Repository` type that `base` is built on.
- `src/modules/api-keys/model.ts` provides `apiKeyModel`, `applyApiKeyTransform` and `ApiKeyDocument`.
- `src/types/index.ts` provides the `ApiKey` type that `StoredApiKey` derives from.
- The module's `services/` files (`api-keys.ts`, `actions.ts`, `resolver.ts`) and its presenter sit alongside this repository in the dependency graph. The code mentions `services/api-keys.ts` as the place that adds `status` to rows, and the credential-resolve path as the caller of `touchLastUsed`.
- The integration tests (`api-keys`, `outcomes`, `sessions-revoked-outbox`, and `tests/integration/security-events`) exercise this repository.

## Notes
- `{ revokedAt: null }` matches both an explicit `null` and an absent field, so a never-revoked row needs no `$exists` clause.
- `revokeMany` skips rows that are already revoked, so `revokedAt` stays at the first moment a key died.
- `findActiveByMinter` leaves out expired keys on purpose. Listing them in a "these were revoked" notice would be untrue.
- `createdByUserId` is stored as a plain string and is never converted with `toObjectId`, so `deleteByUserId` matches it as-is.
- `touchLastUsed` is never awaited on the resolve path. A lost update only means a stale "last used" value.
- The explicit type on `apiKeyRepository` works around TS7056, the same as other modules' repositories (see `src/modules/webhooks/repository.ts`).
