---
source: src/infrastructure/http/middlewares/cache.ts
source_sha256: f4655d76068509ef3ff0065f8c53d71ee726a1d9b13d7231b4dcfef63ed2a499
context_sha256: 671593b9e72b5c45f4459b673f0daf06491e0e5559a5ab474da88f6754329883
generated_at: 2026-11-22T02:48:56.790637+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/http/middlewares/cache.ts

## Purpose
HTTP response caching for the Express API: the stored envelope, the TTL policy and the size gate. The underlying adapter only stores opaque bytes under a key, so the JSON envelope, the development TTL clamp and the per-entry byte limit live here, with the only consumer of all four. A project caching something that is not a response inherits none of them.

## Key elements
- `CachedResponse` (internal interface): the stored envelope. It holds `status`, `body`, `staleAt` (soft expiry, epoch ms), `savedAt` (becomes the `Age` header on a hit), an optional `etag` (replayed so a miss and a hit send the same tag) and an optional `contentLanguage`.
- `resolveCacheTtl(seconds)`: returns the route's TTL unchanged in production. Outside production (`isRelaxedEnvironment()`) it caps the TTL at `NODE_REDIS_CACHE_DEV_TTL_MAX`; a value of `0` opts out. It is applied where the TTL enters the system (the `setCache` middleware), so `Cache-Control: max-age` matches what the server actually honours.
- `serializeCachedResponse(key, value)`: `JSON.stringify`s the envelope and returns `undefined` if it exceeds `NODE_REDIS_CACHE_MAX_BYTES`. It logs a warning in that case. The response is still served, just not cached.
- `isCachedResponse` / `parseCachedResponse`: field-by-field validation of a stored value. A corrupt or old-shape entry degrades to a cache miss instead of a 500.
- `CacheTags` (exported type) and `resolveTags`: invalidation tags, either a fixed list or a function of the request.
- `CacheOptions` (internal interface), per route:
  - `tags`
  - `keyParameters` (required; decides which requests share an entry)
  - `keyValues`
  - `orderedKeyParameters`
  - `keyAs`
  - `languageNeutral`
  - `browserRevalidate`
- Constants:
  - `CACHE_STATUS_NAME` (`'api-redis'`, for the RFC 9211 `Cache-Status` header)
  - `STALE_WHILE_REVALIDATE_SECONDS` (60)
  - `STALE_IF_ERROR_SECONDS` (300, advertised only; nothing server-side reads it)
  - `ENVIRONMENT_CACHE_SECONDS` (60, used by `environmentCache`)
  - `secondsBetween`, a helper that returns whole seconds with a minimum of 1
- The visible text also references `setCache`, `getCacheKey`, `armCacheWrite`, `invalidateCache`, `searchCache` and `environmentCache`. Their bodies are not part of the shown excerpt.

## Relationships
- `@infrastructure/adapters/cache`: supplies `getCacheValue`, `setCacheValue`, `claimCacheRefresh` and `invalidateCacheTagsLogged`, the raw storage, refresh-claim and tag-invalidation primitives.
- `@infrastructure/http/config` (`responseCacheConfig`): supplies `NODE_REDIS_CACHE_DEV_TTL_MAX` and `NODE_REDIS_CACHE_MAX_BYTES`.
- `@infrastructure/runtime/config`: `isRelaxedEnvironment()` decides whether the dev TTL clamp applies.
- `@infrastructure/adapters/logger`: used for the oversize-skip warning.
- `@infrastructure/observability/metrics-cache`: provides `cacheRequestsTotal`.
- `@infrastructure/http/request`: provides `bodyRecordOf`.
- `@domain-primitives/time`: provides `HOUR_SECONDS`.
- `src/kernel/middlewares/locale-preview.ts` and the global `attachLocale`: `languageNeutral` routes must also be in the `isLanguageNeutral` registry, and a test keeps the two lists equal.
- Route modules (`account`, `addresses`, `delivery`, `example`, `inventory/availability-routes`, `locales`) are graph neighbors that consume these middlewares.
- `scripts/docs/generate-role-matrix.ts` is also a graph neighbor; no interaction is visible in the shown content.

## Notes
- `keyParameters` is required. A wrong declaration means requests that should differ share an entry, which is a correctness bug rather than a missed optimisation.
- Only scalars, or arrays of scalars, feed the cache key. Anything else skips the cache. Non-ordered arrays are sorted into the key, so `?id=a&id=b` and `?id=b&id=a` are one entry.
- Redis' TTL is `ttl + grace`, longer than `staleAt`, so stale bytes remain available for refresh-ahead serving.
- `browserRevalidate` applies to GET only; a POST answer is always `no-store`.
- Errors on language-neutral routes are still translated and never cached.
