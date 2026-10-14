---
source: src/modules/api-keys/repository.ts
sha256: 6a96cbc744242503116501906065ad8c06cf9f6ac32e881bef1f15220de916b5
generated_at: 2026-10-14T15:00:09.227598+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/repository.ts

## Purpose

Data-access layer for the `apikeys` collection. Extends the generic `createRepository` factory with six domain-specific queries that the generic CRUD cannot express—most critically the credential-resolve lookup that must exclude revoked/expired rows *at the query level* rather than relying on a downstream caller to re-check.

## Key elements

- **`apiKeyRepository`** (export) — composite object combining the factory's standard CRUD (`find`, `findById`, `create`, `update`, `delete`) with the six custom queries below. Explicitly typed to satisfy TS7056 (same pattern as `webhooks/repository.ts`).
- **`findActiveByPrefix(publicPrefix)`** — returns the single live credential matching a public prefix, or `null`. Filters `revokedAt` and `expiresAt` in the Mongo query so a dead key is indistinguishable from a missing one.
- **`findAnyByPrefix(publicPrefix)`** — same lookup but ignores revocation/expiry state. Intended only for diagnostic naming ("this prefix maps to key X, currently revoked"); must never be used to authenticate.
- **`touchLastUsed(id)`** — stamps `lastUsedAt`. Designed to be fire-and-forget from the resolve path; a lost write is acceptable.
- **`deleteByUserId(userId, session?)`** — bulk-deletes all keys minted by a user. Accepts an optional Mongoose `ClientSession` for transactional account deletion.
- **`findActiveByMinter(userId)`** — lists a user's keys that are neither revoked nor expired (expired keys are excluded from the result).
- **`revokeMany(ids, at)`** — batch-sets `revokedAt` only on rows where it is still `null`, making the operation idempotent and preserving the original revocation timestamp.
- **`base`** (internal) — the `createRepository` result scoped to `apiKeyModel` with `applyApiKeyTransform`. No `searchable` option because the admin list has no free-text filter.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — provides `createRepository` (generic CRUD factory) and the `Repository` base type that `apiKeyRepository` extends.
- **`src/modules/api-keys/model.ts`** — provides `apiKeyModel` (Mongoose model), `applyApiKeyTransform`, and the `ApiKeyDocument` type used throughout.
- **`src/modules/api-keys/services/api-keys.ts`** — primary consumer; calls the standard CRUD and `revokeMany` / `findActiveByMinter` for admin operations.
- **`src/modules/api-keys/services/resolver.ts`** — credential-resolve path; calls `findActiveByPrefix` (auth check) and `touchLastUsed` (async bookkeeping).
- **`src/types/index.ts`** — source of the `ApiKey` domain type used in the repository's generic parameter.
- **`src/modules/api-keys/tests/integration/api-keys.test.ts`** — integration tests exercising the full CRUD + custom-query surface.
- **`src/modules/api-keys/tests/integration/sessions-revoked-outbox.test.ts`** — tests the interaction between session revocation and the outbox pattern, touching key revocation.
- **`tests/integration/security-events.test.ts`** — cross-cutting security-event tests that may exercise key lifecycle (creation, revocation).

## Notes

- `revokedAt: null` in Mongo matches both an explicitly-stored `null` and an absent field (Mongo's own equality semantics). No separate `$exists` clause is needed.
- `createdByUserId` is stored as a plain string and is never run through `toObjectId`; match it as-is (see `./model`).
- `touchLastUsed` returns `Promise<void>` (not a document) and is intentionally *not* awaited on the hot auth path—its write latency must not block request resolution.
- `revokeMany` guards with `revokedAt: null` in the filter so a concurrent first writer's timestamp is never overwritten.
- The factory is configured without `searchable`; the admin listing has no free-text search field.
