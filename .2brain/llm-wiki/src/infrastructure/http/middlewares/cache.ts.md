---
source: src/infrastructure/http/middlewares/cache.ts
sha256: 744d1202562924d92cddbff7002893dc61cff38b0d6e5bcb699aacd6b01c838d
generated_at: 2026-10-29T02:02:03.421283+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/cache.ts

## Purpose

HTTP response-caching layer: builds the JSON envelope, enforces the TTL policy (including a development clamp and RFC 5861 `stale-while-revalidate` / `stale-if-error` headers), and gates writes by entry size. It sits above the generic Redis adapter so that only response-caching consumers inherit the envelope shape, the dev TTL cap, and the byte-limit check.

## Key elements

- **`resolveCacheTtl(seconds)`** *(exported)* — Clamps a route's declared TTL to `NODE_REDIS_CACHE_DEV_TTL_MAX` outside production; returns the value unchanged in production or when the cap is `0`.
- **`setCache(options: CacheOptions)`** *(exported middleware, truncated in listing)* — The main caching middleware: on miss, wraps the response in a `CachedResponse` envelope, serialises it, checks the byte limit, and stores via `setCacheValue`. Emits `Cache-Control` / `Cache-Status` headers and tracks metrics.
- **`invalidateCache(tags)`** *(exported, referenced in comments)* — Clears Redis entries matching the given tags via `invalidateCacheTagsLogged`.
- **`CachedResponse`** — The stored envelope: `{ status, body, staleAt }`. `staleAt` (epoch ms) marks the start of the grace window before Redis TTL expiry.
- **`CacheOptions`** — Per-route config: `keyParameters`, `keyValues`, `orderedKeyParameters`, `keyAs`, `browserRevalidate`, `scopeKey`, `tags`.
- **`serializeCachedResponse`** — JSON-serialises the envelope and rejects entries exceeding `NODE_REDIS_CACHE_MAX_BYTES` (logs a warning, returns `undefined`).
- **`isCachedResponse` / `parseCachedResponse`** — Runtime shape check + safe deserialisation; corrupt or stale-schema entries degrade to a cache miss rather than a 500.
- **`keySpelling` / `isScalar`** — Serialise individual parameter values into the cache key. Non-scalar values or nested objects cause the request to skip caching. Arrays are sorted unless listed in `orderedKeyParameters`.
- **`STALE_WHILE_REVALIDATE_SECONDS` (60)**, **`STALE_IF_ERROR_SECONDS` (300)** — Advertised in `Cache-Control` for shared-cache behaviour.

## Relationships

- **`src/infrastructure/adapters/cache.ts`** — Provides the raw `getCacheValue` / `setCacheValue` / `claimCacheRefresh` / `invalidateCacheTagsLogged` primitives. This file adds the response-specific envelope, size gate, and TTL policy on top.
- **`src/infrastructure/http/config.ts`** — Source of `responseCacheConfig()` which supplies `NODE_REDIS_CACHE_DEV_TTL_MAX` and `NODE_REDIS_CACHE_MAX_BYTES`.
- **`src/infrastructure/runtime/config.ts`** — `isRelaxedEnvironment()` determines whether the dev TTL clamp applies.
- **`src/infrastructure/http/request.ts`** — `bodyRecordOf` extracts the JSON body for key construction.
- **`src/infrastructure/adapters/logger.ts`** — Warns when a response is too large to cache.
- **`src/infrastructure/observability/metrics-cache.ts`** — `cacheRequestsTotal` counter incremented on hit/miss/skip.
- **`src/modules/*/routes.ts`** (account, addresses, cart, delivery, example, locales) — Consumers that declare `CacheOptions` and call `setCache` / `invalidateCache`.
- **`scripts/contracts/private-no-cache-routes.ts`** — Contract check ensuring sensitive routes do not opt into caching.
- **`src/kernel/middlewares/locale-preview.ts`** — Sibling middleware in the HTTP pipeline that may interact with cached responses (locale preview overrides).

## Notes

- The file is intentionally separate from `adapters/cache.ts`: a non-response cache (e.g. a job-result store) uses the adapter directly and inherits none of the envelope, TTL clamp, or byte limit.
- `keyParameters` is **required** in `CacheOptions` — omitting it is a correctness bug, not a performance one. Most routes pass `[]`.
- `scopeKey` must return `false` for any caller whose visibility exceeds the guest scope; those requests **bypass** Redis entirely (neither read nor write).
- The dev TTL clamp is applied at the `setCache` middleware entry point (not at write time) so that the advertised `max-age` header matches the actual server-side lifetime.
- `staleAt` in the envelope is strictly before the Redis TTL (`ttl + grace`), ensuring the bytes are still present during the `stale-while-revalidate` window.
- Array key parameters are sorted into the key by default; only parameters listed in `orderedKeyParameters` preserve element order (e.g. `sort`).
