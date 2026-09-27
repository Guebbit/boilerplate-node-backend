---
source: src/modules/api-keys/repository.ts
sha256: 1d9162311db5beee6e999478063947dae2c6110ec5fc566e0c98906a42d354cd
generated_at: 2026-09-27T14:41:07.669157+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/repository.ts

## Purpose

Data-access layer for the `apikeys` collection. It wraps the shared `createRepository` CRUD factory and adds three domain-specific queries that the generic factory cannot express: active-key resolution by prefix, a fire-and-forget `lastUsedAt` stamp, and bulk deletion by owner.

## Key elements

- **`base`** (module-local) — `createRepository<ApiKeyDocument, ApiKey>(apiKeyModel, { transform: applyApiKeyTransform })`. Provides standard CRUD; deliberately omits `searchable` because the admin list has no free-text filter.
- **`findActiveByPrefix(publicPrefix)`** — Returns the single active key for a public prefix or `null`. Filters `revokedAt`/`expiresAt` *at the query level* so a revoked/expired key fails identically to a non-existent one, with no second downstream check.
- **`touchLastUsed(id)`** — `$set`s `lastUsedAt` to `new Date()`. Returns `Promise<void>`; intended to be fire-and-forget (never awaited by the resolve path).
- **`deleteByUserId(userId, session?)`** — `deleteMany` on `createdByUserId`; accepts an optional Mongoose `ClientSession` for transactional account deletion.
- **`apiKeyRepository`** (exported) — The public surface: `…base` plus the three custom methods above. Carries an explicit type annotation (`Repository<…> & { … }`) to sidestep TS 7056, same convention as other module repositories.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — Supplies the `createRepository` factory and the `Repository` interface that this file composes.
- **`src/modules/api-keys/model.ts`** — Provides `apiKeyModel` (Mongoose model), `applyApiKeyTransform` (document→DTO mapper), and the `ApiKeyDocument` type used throughout.
- **`src/types/index.ts`** — Source of the `ApiKey` DTO type parameter.
- **`src/modules/api-keys/services/resolver.ts`** — Consumer of `findActiveByPrefix` and `touchLastUsed` on the credential-resolve path.
- **`src/modules/api-keys/services/api-keys.ts`** — Consumer of the CRUD surface and `deleteByUserId` for admin/account operations.
- **`src/modules/api-keys/tests/integration/api-keys.test.ts`** — Integration tests exercising these methods.

## Notes

- `{ revokedAt: null }` in Mongo matches both an explicitly-null value *and* an absent field (native equality semantics), so no extra `$exists` clause is needed.
- `touchLastUsed` is documented as fire-and-forget: a lost update (crash between resolve and write) only costs a stale "last used" reading.
- `createdByUserId` is a plain string column — it is **never** run through `toObjectId`, so equality matching works as-is.
- The explicit export annotation mirrors the pattern in `webhooks/repository.ts` and other module repositories (referenced in a code comment).
