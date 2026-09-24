---
source: src/modules/api-keys/repository.ts
sha256: bd09d9a588520319cb9526a2856ca6eb37b736747334d5117f158a017451df15
generated_at: 2026-09-23T18:24:58.558596+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/repository.ts

## Purpose

Repository for the `apikeys` collection. It wires the shared CRUD factory to the API-key model and adds two queries the generic factory has no shape for: an active-credential lookup by public prefix and a fire-and-forget `lastUsedAt` stamp.

## Key elements

- **`base`** — Result of `createRepository<ApiKeyDocument, ApiKey>(apiKeyModel, { transform: applyApiKeyTransform })`. Standard CRUD scoped to `apikeys`; intentionally omits `searchable` (no free-text filter on the admin list).
- **`findActiveByPrefix(publicPrefix)`** — Returns the single active credential for a given public prefix, or `null`. Filters `revokedAt: null` and `expiresAt` (null or future) **inside the Mongo query**, so a revoked/expired key is indistinguishable from a non-existent one.
- **`touchLastUsed(id)`** — `$set { lastUsedAt: new Date() }` on a single document. Returns `Promise<void>`; designed to be fire-and-forget (never awaited by callers).
- **`apiKeyRepository`** (export) — The combined object: spread of `base` plus the two custom methods. Carries an explicit type annotation to satisfy TS7056 (same pattern as every other module's repository).

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — Provides the `createRepository` factory and the `Repository` interface consumed here.
- **`src/modules/api-keys/model.ts`** — Supplies `apiKeyModel` (Mongoose model), `applyApiKeyTransform`, and the `ApiKeyDocument` type used as the document generic.
- **`src/modules/api-keys/module.ts`** — Registers/binds `apiKeyRepository` into the DI graph for this module.
- **`src/modules/api-keys/services/api-keys.ts`** — Consumes `apiKeyRepository` (CRUD, `findActiveByPrefix`, `touchLastUsed`) in service-layer logic.
- **`src/modules/api-keys/tests/integration/api-keys.test.ts`** — Integration tests that exercise the repository's behavior end-to-end.

## Notes

- `findActiveByPrefix` deliberately filters revoked/expired **at query time**, not post-fetch, so no downstream caller can accidentally skip the check. `{ revokedAt: null }` relies on Mongo's equality semantics: it matches both an explicitly-`null` field and an absent field, eliminating the need for a separate `$exists` clause.
- `touchLastUsed` is expected to be called without `.await`; a lost update (crash between auth resolve and the write) is accepted as at most a stale "last used" reading.
- The explicit type annotation on the export is a known workaround for TS7056 and is replicated in every module repository (see `webhooks/repository.ts` for the same comment).
