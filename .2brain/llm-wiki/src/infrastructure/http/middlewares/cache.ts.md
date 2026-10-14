---
source: src/infrastructure/http/middlewares/cache.ts
sha256: 0f12c404c5a989fdfc16f1508290c9b758ea05beb30cedd142a1ecc9828c15d9
generated_at: 2026-10-14T07:55:14.200796+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/cache.ts

## Purpose

HTTP response-caching middleware for Express routes. It defines the JSON envelope stored in Redis, the TTL policy (including a development-time clamp and refresh-ahead stale window), the per-entry size gate, and the key-derivation logic that maps a request's declared parameters to a stable cache key. All of this lives here rather than in the cache adapter because it is specific to caching HTTP responses; a different consumer of the same adapter would not need the envelope, the TTL clamp, or the byte limit.

## Key elements

- **`CachedResponse`** — interface: `{ status, body, staleAt }`. The shape stored in Redis; `staleAt` marks the refresh-ahead soft expiry (strictly before the Redis TTL).
- **`CacheOptions`** — options object passed by route consumers. Carries `keyParameters`, `keyValues`, `orderedKeyParameters`, `keyAs`, `browserRevalidate`, `tags`, and the required `scopeKey` guard.
- **`resolveCacheTtl(seconds)`** — clamps a route's declared TTL to `NODE_REDIS_CACHE_DEV_TTL_MAX` outside production; production is never clamped.
- **`serializeCachedResponse(key, value)`** — serialises the envelope to a JSON string and rejects it (returns `undefined`) if it exceeds `NODE_REDIS_CACHE_MAX_BYTES`, logging a warning.
- **`isCachedResponse` / `parseCachedResponse`** — shape guard + safe parse so a corrupt or outdated entry degrades to a cache miss rather than a 500.
- **`keySpelling` / `keySegments`** — build the deterministic key segments from request body/query values; only scalars or flat arrays of scalars qualify; array elements are sorted unless flagged as ordered.
- **`STALE_WHILE_REVALIDATE_SECONDS` (60) / `STALE_IF_ERROR_SECONDS` (300)** — RFC 5861 constants advertised in `Cache-Control` headers; the first is also used server-side to set `staleAt`.
- **`setCache` / `invalidateCache`** (referenced in comments, defined in the truncated portion) — the two middlewares/routes-consumers actually call: one arms a cache write on response, the other invalidates by tag on writes.

## Relationships

- **`src/infrastructure/adapters/cache.ts`** — supplies the four low-level operations: `getCacheValue`, `setCacheValue`, `claimCacheRefresh`, `invalidateCacheTagsLogged`. This file adds the response-specific envelope, TTL policy, and size gate on top.
- **`src/infrastructure/http/config.ts`** — provides `responseCacheConfig()` which exposes `NODE_REDIS_CACHE_DEV_TTL_MAX` and `NODE_REDIS_CACHE_MAX_BYTES`.
- **`src/infrastructure/runtime/config.ts`** — provides `isRelaxedEnvironment()` to decide whether the dev TTL clamp applies.
- **`src/infrastructure/http/request.ts`** — provides `bodyRecordOf()` to safely read the parsed body for key construction.
- **`src/infrastructure/adapters/logger.ts`** — used to warn when a response is skipped due to the byte limit.
- **`src/infrastructure/observability/metrics-cache.ts`** — `cacheRequestsTotal` counter incremented on hit/miss/skip.
- **Module routes** (`account`, `addresses`, `cart`, `example`, `feedback`, `locales`, `orders`, `payments`) — consumers that import `setCache` and `invalidateCache` to opt their endpoints into the cache and to tag entries for invalidation on writes.

## Notes

- `keyParameters` is **required** in `CacheOptions`; omitting it is a correctness bug (wrong requests sharing an entry), not a missed optimisation.
- `scopeKey` is also required. A route whose answer depends on the caller's role **must** return `false` for non-guest callers; those requests bypass Redis entirely. The guard is backed by `kernel/access/query.ts#hasAnonymousReadScope`.
- The dev TTL clamp (`NODE_REDIS_CACHE_DEV_TTL_MAX`) is applied at the middleware entry point, not at write time, so the `Cache-Control: max-age` header and the actual server-side lifetime stay in agreement.
- Key construction prefers body over query (matching the `search` surface's own precedence) and uses `Object.hasOwn` rather than `in` to avoid prototype-chain false positives.
- `keyValues` lets a route supply pre-parsed values so that semantically equivalent spellings (e.g. `"0e0"` vs `0`) land on the same key; returning `undefined` from the callback skips caching for that request.
- `keyAs` lets two different routes (e.g. `GET /products?text=x` and `POST /products/search`) share one cache entry when they reach the same controller.
