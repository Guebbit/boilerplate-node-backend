---
source: src/infrastructure/http/middlewares/cache.ts
sha256: 6e0b47a826fc51c515e489a22253bd809155988df5762191d90a66cc83f88db8
generated_at: 2026-11-14T18:01:08.356865+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/cache.ts

## Purpose
Implements HTTP response caching as an Express middleware: defines the JSON envelope stored in Redis, the TTL policy (including a development clamp), the per-entry byte limit, and the key-construction logic. All four concerns live here (rather than in the storage adapter) because they are specific to caching HTTP responses; a non-response consumer of `adapters/cache.ts` inherits none of them.

## Key elements
- **`CachedResponse`** (interface) — the stored envelope: `status`, `body`, `staleAt` (epoch ms for refresh-ahead), and optional `etag` for versioned reads.
- **`CacheOptions`** (interface) — per-route configuration consumed by the middleware: `keyParameters`, `keyValues`, `orderedKeyParameters`, `keyAs`, `browserRevalidate`, `scopeKey`, and `tags`.
- **`resolveCacheTtl`** (exported) — clamps a route's declared TTL to `NODE_REDIS_CACHE_DEV_TTL_MAX` outside production; no-op in prod.
- **`serializeCachedResponse`** — JSON-stringifies the envelope, rejects entries exceeding `NODE_REDIS_CACHE_MAX_BYTES` (logs a warning, returns `undefined`).
- **`isCachedResponse`** / **`parseCachedResponse`** — runtime shape guard + safe deserializer; a corrupt or out-of-shape entry degrades to a miss rather than a 500.
- **`keySpelling`** — normalises a single key value (scalar or scalar array) into a canonical string; non-scalar values skip the cache. Arrays are sorted unless flagged `ordered`.
- **`STALE_WHILE_REVALIDATE_SECONDS`** (60) and **`STALE_IF_ERROR_SECONDS`** (300) — RFC 5861 constants advertised in `Cache-Control` so shared caches and the origin agree on stale semantics.
- **`CACHE_STATUS_NAME`** (`'api-redis'`) — identifier for the RFC 9211 `Cache-Status` debug header.
- *(Truncated portion)* — the file also contains the `setCache` middleware, `getCacheKey`, `invalidateCache`, and `armCacheWrite` helpers referenced in the docstrings above.

## Relationships
- **`src/infrastructure/adapters/cache.ts`** — the low-level Redis adapter; this file calls `setCacheValue`, `getCacheValue`, `invalidateCacheTagsLogged`, and `claimCacheRefresh` for all I/O.
- **`src/infrastructure/http/config.ts`** — provides `responseCacheConfig()` for `NODE_REDIS_CACHE_MAX_BYTES` and `NODE_REDIS_CACHE_DEV_TTL_MAX`.
- **`src/infrastructure/runtime/config.ts`** — `isRelaxedEnvironment()` gates the dev TTL clamp.
- **`src/infrastructure/http/request.ts`** — `bodyRecordOf` is used to extract raw body values for key construction.
- **`src/infrastructure/adapters/logger.ts`** — `logger` import used for warning logs (e.g., size-limit skips).
- **`src/infrastructure/observability/metrics-cache.ts`** — `cacheRequestsTotal` counter is incremented on cache operations.
- **`src/domain-primitives/time.ts`** — `HOUR_SECONDS` used in TTL calculations.
- **Route files** (`modules/account`, `addresses`, `cart`, `delivery`, `example`) — consumers that invoke the `setCache` middleware with `CacheOptions`.
- **`src/kernel/middlewares/locale-preview.ts`** — sibling middleware in the HTTP pipeline that interacts with response headers.

## Notes
- The dev TTL clamp is applied where the TTL *enters* the system (middleware), not at write time, so the `Cache-Control: max-age` header and the actual Redis TTL always agree.
- `scopeKey` is a **correctness** gate, not an optimisation: returning `false` bypasses Redis entirely rather than storing a wider answer. It is backed by `kernel/access/query.ts#hasAnonymousReadScope`.
- Key construction sorts both parameter names and (unordered) array values to ensure canonical ordering; only scalars and arrays of scalars participate—anything else skips the cache for that request.
- A response exceeding the byte limit is **not** an error; the caller still receives its response, it simply will not be replayable from cache.
- The `staleAt` field is intentionally set strictly before Redis's own TTL (`ttl + grace`) so bytes survive through the grace window.
