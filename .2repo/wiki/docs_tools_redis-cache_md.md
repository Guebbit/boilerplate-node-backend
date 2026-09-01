# docs/tools/redis-cache.md

## Purpose

Documents how the codebase uses Redis as an **optional** server-side cache for repeated GET responses. It covers the two-layer design (a tag-aware byte-store adapter and an HTTP middleware), key construction from declared parameters, size and memory caps, the cache-aside invalidation model, and how the design behaves across clustered workers. The page exists so readers understand the invariants (key correctness, bounded storage, graceful degradation) without re-reading both source files.

## Key elements

- **`src/infrastructure/adapters/cache.ts`** — Tag-aware byte store: `get`, `set`, `invalidateByTag`, `clear`. Stores opaque bytes; no opinion about response semantics.
- **`src/infrastructure/http/middlewares/cache.ts`** — HTTP-level cache middleware:
  - `setCache(ttl, { tags, keyParameters })` — route decorator that builds the cache key, checks/stores the serialized response, enforces `NODE_REDIS_CACHE_MAX_BYTES`, and sets TTL.
  - `invalidateCache` — deletes tag-set entries; called by every write handler.
  - `clearCache()` — `SCAN` + `DEL` under `NODE_REDIS_CACHE_PREFIX`; returns `{ deleted, reachable }` (never throws).
  - `getCacheScope` — caller/locale discriminator baked into the key.
- **`keyParameters`** (per-route, required array) — declares which query params affect the response; the key is built from path + scope + locale + declared params only. Search routes export `Object.keys(schema.shape)` to stay in sync with validation.
- **Env vars** — `NODE_REDIS_CACHE_MAX_BYTES` (default 256 KB), `NODE_REDIS_MAXMEMORY` (default 256 mb), `NODE_REDIS_MAXMEMORY_POLICY` (default `allkeys-lru`), `NODE_REDIS_CACHE_PREFIX`, `NODE_REDIS_CACHE_DEV_TTL_MAX` (default 30 s, non-prod only).
- **`npm run db:cache:clear`** — standalone script that calls `clearCache()`; exits 1 if Redis was unreachable. `db:seed` calls it automatically when it creates data.

## Relationships

- **`docs/reference/src-infrastructure.md`** — The two source files (`adapters/cache.ts`, `http/middlewares/cache.ts`) live in the infrastructure layer documented there.
- **`docs/theory/clustering.md`** — Explicitly referenced: each cluster worker opens its own Redis connection but shares one keyspace; no in-process L1 cache means no stale-per-worker copies.
- **`docs/tools/mongodb-mongoose.md`** — Cache-aside pattern: Redis sits in front of MongoDB; a cache miss triggers the Mongo query path documented there.
- **`docs/tools/package-scripts.md`** — `db:cache:clear` and `db:seed` (which auto-clears cache) are the two scripts that interact with the cache.
- **`docs/tools/package-dependencies.md`** — The `redis` (node-redis) npm package is the sole client dependency.
- **`docs/api/asyncapi-workflow.md`** — A pub/sub channel `cache.tags.invalidated` was once defined here and later removed; invalidation now relies on the shared keyspace alone.
- **`docs/theory/request-flow.md`** — The GET flow (middleware → Redis check → controller → Mongo → store) is the request-path this cache participates in.

## Notes

- **`keyParameters` is required, not optional.** Omitting a parameter the controller reads is a correctness bug (serves one user's search to another), not a missed optimisation.
- **Fails open everywhere.** Redis down → 200s continue; oversized body → served but not stored; `clearCache` unreachable → resolved, not thrown.
- **Eviction policy matters.** `allkeys-lru` turns the memory cap into a graceful policy; the Redis default `noeviction` would reject writes and log a warning per request.
- **Out-of-band writes are the weak spot.** `db:seed`, `mongosh`, or a GUI can change Mongo while Redis still serves the old answer. The dev TTL clamp (`NODE_REDIS_CACHE_DEV_TTL_MAX`, default 30 s) is the primary guard; `db:cache:clear` covers writers that remember to call it. Production is assumed to have the API as the sole writer.
- **No pub/sub broadcast exists (or used to).** A cross-worker `cache.tags.invalidated` channel was implemented and then deleted; the shared keyspace makes it unnecessary as long as there is no process-local L1 cache.
- **`clearCache` callers disagree on purpose.** `db:seed` ignores `reachable: false` (seeding must not block on a dead cache); `db:cache:clear` exits 1 (a recovery tool that silently no-ops is indistinguishable from an empty cache).
