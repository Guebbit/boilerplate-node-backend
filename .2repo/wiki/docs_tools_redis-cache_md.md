# docs/tools/redis-cache.md

## Purpose

Documents how the project uses Redis as an **optional** server-side cache for repeated GET responses. The cache is split into a low-level byte-store adapter (get, set, invalidate-by-tag, clear) and an HTTP middleware layer that owns key construction, envelope format, TTL policy, and size limits. If Redis is unreachable the app fails open and continues serving from the database.

## Key elements

- **`src/infrastructure/adapters/cache.ts`** — Low-level byte store with tags: `get`, `set`, `invalidateByTag`, `clearCache`. Stores opaque bytes; has no opinion about response size or HTTP semantics.
- **`src/infrastructure/http/middlewares/cache.ts`** — `setCache(ttl, { tags, keyParameters })` middleware that builds the cache key from declared parameters, serialises the response envelope, enforces the size limit, and handles tag-based invalidation. Also exports `invalidateCache` and `clearCache`.
- **`keyParameters`** — Required per-route list of query params that affect the response. Derived from the validation schema (`Object.keys(schema.shape)`) so the key cannot drift from what the controller reads.
- **`NODE_REDIS_CACHE_MAX_BYTES`** (default 262 144 / 256 KB) — Maximum single-response body the middleware will store. Oversized bodies are still returned; they simply skip caching.
- **`NODE_REDIS_MAXMEMORY` / `NODE_REDIS_MAXMEMORY_POLICY`** — Container-level Redis memory cap (default 256 MB) and eviction policy (default `allkeys-lru`). Must stay on an `allkeys-` variant so the cap evicts rather than refusing writes.
- **`NODE_REDIS_CACHE_DEV_TTL_MAX`** (default 30 s) — Clamps every route's TTL outside production to bound staleness from out-of-band writes (seed scripts, mongosh, migrate-mongo). Set to `0` to disable.
- **`NODE_REDIS_CACHE_PREFIX`** — Key prefix shared by all instances; `clearCache` uses `SCAN` + `DEL` under this prefix (never `FLUSHALL`).

## Relationships

- **`src/infrastructure/adapters/cache.ts`** — The byte-store layer this doc describes. The middleware in `src/infrastructure/http/middlewares/cache.ts` calls into it for all reads/writes; the adapter exposes no HTTP concepts.
- **`src/infrastructure/http/middlewares/cache.ts`** — The HTTP-facing layer. Owns key construction, envelope shape, TTL, size guard, and tag invalidation. Routes call `setCache`; write handlers call `invalidateCache`.
- **`src/cluster.ts`** — Forks one worker per CPU core when `NODE_ENABLE_CLUSTERING=1`. Each worker opens its own Redis connection (via the adapter) but addresses the same keyspace, so invalidation is a shared-state delete rather than a cross-process broadcast.
- **`src/app/workers.ts`** — Each worker runs the full Express app and holds no local copy of cached data; every cache read is a round-trip to the shared Redis instance.

## Notes

- **`keyParameters` is required, not optional.** Omitting a param the controller reads serves one caller's results to another — a correctness bug, not a missed optimisation.
- **Size guard lives in the middleware, not the adapter.** The limit is measured on a serialised HTTP response; the adapter stores opaque bytes and has no notion of "response."
- **Out-of-band writes do not invalidate the cache.** `db:seed`, `migrate-mongo`, `mongosh`, and GUI tools mutate Mongo while Redis keeps serving stale entries. Mitigations: `db:seed` calls `db:cache:clear` automatically; `NODE_REDIS_CACHE_DEV_TTL_MAX` caps staleness to seconds in non-production. Production assumes the API is the sole writer.
- **`clearCache()` never throws.** It resolves `{ deleted, reachable }`. `db:seed` ignores `reachable` (must not block a seed); `db:cache:clear` exits 1 when `reachable` is false so an empty-looking result is distinguishable from a real empty cache.
- **No pub/sub invalidation broadcast exists.** Because all workers share one keyspace, a delete by any worker is immediately visible to all. A former `cache.tags.invalidated` AsyncAPI channel was removed. A process-local L1 cache would change this calculus.
- **Redis is optional at runtime.** All cache paths fail open: the app logs a warning and serves from the database. No 500, no retry loop.
