---
source: src/infrastructure/http/middlewares/cache.ts
sha256: dbb572c8226e993d739d2f3ca57a11dc1feeea0f9f1ad440ac471c6216fe0f9c
generated_at: 2026-09-23T17:43:08.759069+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/cache.ts

## Purpose

HTTP response-caching middleware that wraps Express's `response.json` to transparently store, retrieve, and serve cached responses via Redis. It owns the response envelope shape, the TTL clamping policy, the per-entry byte-size gate, and the stale-while-revalidate / stale-if-error header logic — all of which are specific to caching *responses*, not arbitrary key-value data, which is why they live here rather than in the cache adapter.

## Key elements

- **`CachedResponse`** (interface) — the JSON envelope stored in Redis: `{ status, body, staleAt }`. `staleAt` is the soft-expiry boundary; Redis TTL is `ttl + grace`.
- **`resolveCacheTtl(seconds)`** (exported) — clamps a route's declared TTL to `NODE_REDIS_CACHE_DEV_TTL_MAX` (default 30 s) outside production; production is never clamped.
- **`serializeCachedResponse(key, value)`** — `JSON.stringify` the envelope and refuse (return `undefined`) if the payload exceeds `NODE_REDIS_CACHE_MAX_BYTES` (default 256 KiB). Logs a warning on skip.
- **`isCachedResponse` / `parseCachedResponse`** — shape-guard + safe parse so a corrupt or stale-schema entry degrades to a cache miss instead of a 500.
- **`CacheOptions`** (interface) — per-route config: `keyParameters` (which query/body params affect the answer), `keyAs` (override method+path identity for dual-endpoint searches), `browserRevalidate` (ETag-based 304 instead of `max-age`), `tags` (invalidation tags).
- **`getCacheKey(request, sortedKeyParameters, keyAs?)`** — builds the final key from identity + sorted parameter values + user scope + locale. Deliberately excludes the raw query string; only declared params participate.
- **`getCacheScope(request)`** — returns `user:<id>` or `'guest'` so one user's private data is never served to another.
- **`armCacheWrite(response, …)`** — monkey-patches `response.json` so that on a MISS (or claimed REFRESH) the body is written to Redis as it is sent.
- **`STALE_WHILE_REVALIDATE_SECONDS`** (60) / **`STALE_IF_ERROR_SECONDS`** (300) — RFC 5861 constants emitted in `Cache-Control` / `STALE-IF-ERROR` headers; the former is also the server-side grace window.
- **`setCache`** (middleware, inferred from context) — the public Express middleware routes apply; reads from cache, serves hits, arms writes on misses, sets `Cache-Control` and `Vary` headers.

## Relationships

- **`src/infrastructure/adapters/cache.ts`** — the sole Redis I/O boundary. This file calls `getCacheValue`, `setCacheValue`, `claimCacheRefresh`, and `invalidateCacheTagsLogged`; the adapter stores opaque bytes and knows nothing about the envelope.
- **`src/infrastructure/http/request.ts`** — provides `bodyRecordOf`, used by `getCacheKey` to read JSON-body parameters with the same precedence the controllers use.
- **`src/infrastructure/adapters/logger.ts`** — structured logging for size-gate skips and invalidation events.
- **`src/infrastructure/observability/metrics-cache.ts`** — `cacheRequestsTotal` is incremented here to expose hit/miss/refresh counts.
- **`src/infrastructure/runtime/environment.ts`** — `environmentNumber` reads `NODE_REDIS_CACHE_DEV_TTL_MAX` and `NODE_REDIS_CACHE_MAX_BYTES` with typed defaults.
- **Module route files** (`account`, `addresses`, `cart`, `feedback`, `locales`, `orders`, `products`, `users`) and **`tests/support/routes.ts`** — consumers that apply the `setCache` middleware with their own `CacheOptions`.

## Notes

- The TTL clamp is applied at the `setCache` middleware (where the TTL enters the system), not at write time, so the `Cache-Control: max-age` header and the actual Redis TTL always agree.
- `keyParameters` is **required** in `CacheOptions`; omitting it would mean every request to that route shares one entry regardless of query — a correctness bug, not just a perf one.
- Array parameter values are sorted before keying (`?id=a&id=b` ≡ `?id=b&id=a`). The code comments note this is safe today only because no array filter is order-significant; an order-sensitive array param would need an explicit exemption.
- `Object.hasOwn` is used (not `in`) when checking parameter presence to avoid prototype-chain false positives (e.g. a param named `toString`).
- `bodyRecordOf` returns `undefined` for GETs (Express 5 behaviour); the key builder handles both body and query transports.
- The file is the *only* consumer of the adapter's four exported functions that care about response semantics; a hypothetical non-response cache would not inherit the envelope, TTL clamp, size gate, or stale-while-revalidate logic.
