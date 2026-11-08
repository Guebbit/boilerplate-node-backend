---
source: src/modules/api-keys/repository.ts
sha256: 45e4125de6b00b08d80fedba472a96b7468bd2ebe26068c4cb1c1e38f1da7efe
generated_at: 2026-11-08T05:03:39.260175+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/repository.ts

## Purpose

Data-access layer for the `apikeys` collection. Wraps the shared CRUD factory with domain-specific queries that the generic shape cannot express (prefix-scoped lookups that filter revoked/expired *at the query*, idempotent batch revocation, minter resolution). Exists so the service layer never touches Mongoose directly.

## Key elements

- **`StoredApiKey`** — wire type: `ApiKey` minus `status` and `actions`. Whether a minter can still sign in is a fact about *another* collection, appended by the service after the read.
- **`base`** — result of `createRepository` scoped to `apiKeyModel`; supplies list/get/create/update/delete with sorting on `createdAt`, `expiresAt`, `lastUsedAt`.
- **`findActiveByPrefix(publicPrefix)`** — the credential-resolve lookup. Filters `revokedAt: null` and not-yet-expired *in the query* so a dead key fails identically to a missing one.
- **`findAnyByPrefix(publicPrefix)`** — same lookup but in *any* state; used only to name why an active lookup missed.
- **`touchLastUsed(id)`** — fire-and-forget `$set lastUsedAt`; never awaited by callers.
- **`deleteByUserId(userId, session?)`** — hard-delete all keys for a user (account-deletion path). Accepts an optional Mongoose session for transactions.
- **`findActiveByMinter(userId)`** — all non-revoked, non-expired keys a user minted (for "these were revoked" notices).
- **`revokeMany(ids, at)`** — idempotent batch revoke: only sets `revokedAt` where it is still `null`, so the first revocation time is never overwritten.
- **`mintersOf(ids)`** — resolves `createdByUserId` for a set of key ids; returns `Map<string, string>`.
- **`apiKeyRepository`** (export) — composite object spreading `base` plus all custom methods. Explicitly annotated to satisfy TS7056 (same pattern as `webhooks/repository.ts`).

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — supplies the `createRepository` factory and the `Repository` interface that `base` conforms to.
- **`src/modules/api-keys/model.ts`** — provides `apiKeyModel` (Mongoose model), `applyApiKeyTransform` (document → wire shape), and the `ApiKeyDocument` type.
- **`src/types/index.ts`** — source of the `ApiKey` interface used to derive `StoredApiKey`.
- **`src/modules/api-keys/services/api-keys.ts`** — primary consumer; reads via `findActiveByPrefix`/`findActiveByMinter`, writes via `revokeMany`/`deleteByUserId`, and fires `touchLastUsed` without awaiting.
- **`src/modules/api-keys/services/resolver.ts`** — credential-resolve path; calls `findActiveByPrefix` and `findAnyByPrefix`.
- **`src/modules/api-keys/tests/integration/*.test.ts`** — integration suites exercise the repository through the service layer.

## Notes

- **`status` is not a stored field.** The repository returns rows without it; `services/api-keys.ts` adds it post-read. Do not add `status` to the Mongoose schema.
- **`revokedAt: null` relies on Mongo equality semantics.** It matches both an explicitly-null value *and* an absent field, so no `$exists` clause is needed.
- **`createdByUserId` is a plain string**, never `toObjectId`'d. All matchers use it as-is.
- **`touchLastUsed` is intentionally lossy.** A crash between resolve and the update leaves a stale timestamp; the codebase accepts that trade-off to avoid latency on the hot auth path.
- **`revokeMany` is safe to call concurrently.** The `revokedAt: null` guard in the filter makes it idempotent — the first writer wins.
