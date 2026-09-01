# src/infrastructure/http/middlewares/cache.ts

## Purpose

Express middleware layer that makes GET responses cacheable in Redis. It defines the response envelope format, the TTL policy (with a development ceiling), the per-entry size gate, and the key-derivation rules that determine which requests share a cached response. All of this lives here—rather than in the storage adapter—because it is specific to caching *HTTP responses*; a project caching arbitrary data inherits none of it.

## Key elements

- **`CachedResponse`** (interface) — the stored envelope: `{ status: number, body: unknown }`. Enough to replay a response verbatim.
- **`resolveCacheTtl(seconds)`** (exported) — clamps a route's declared TTL to a development ceiling (`NODE_REDIS_CACHE_DEV_TTL_MAX`, default 30 s). Production TTLs pass through unchanged.
- **`setCache(seconds, options)`** (exported) — the main middleware factory. Serves a stored envelope on a hit; on a miss, lets the controller run and arms `response.json` to write the result to Redis (2xx only). Throws at request time if `response.locals.noStore` is already set.
- **`CacheOptions`** (interface) — `keyParameters` (required, the query/body params the answer depends on), `tags` (invalidation tags), `keyAs` (shared identity across method+path spellings), `browserRevalidate` (sends ETag instead of `max-age`).
- **`getCacheKey(request, sortedKeyParameters, keyAs?)`** — builds the key from identity + sorted, normalized param values + user scope + locale. Deliberately excludes the raw query string.
- **`getCacheScope(request)`** — isolates entries per authenticated user (`user:<id>`) or `guest`.
- **`normalizeKeyValue(value)`** — coerces scalars to strings so `{page: 1}` and `?page=1` produce the same key.
- **`armCacheWrite(response, key, ttl, tags)`** — monkey-patches `response.json` to serialize, size-check, and store the response before it is sent.
- **`serializeCachedResponse` / `parseCachedResponse`** — JSON round-trip with a size gate (default 256 KB, `NODE_REDIS_CACHE_MAX_BYTES`) and a safe parse that degrades corrupt entries to a miss rather than a 500.
- **`DEFAULT_DEV_TTL_MAX_SECONDS`**, **`DEFAULT_MAX_CACHED_BYTES`** — fallback constants overridable via env vars.

## Relationships

- **`src/infrastructure/adapters/cache.ts`** — provides the low-level `getCacheValue`, `setCacheValue`, and `invalidateCacheTags` that this middleware calls for actual Redis I/O. This file owns *policy* (envelope, TTL clamp, size gate); the adapter owns *storage*.
- **`src/infrastructure/adapters/logger.ts`** — `logger.warn` is called when a response is too large to cache.
- **`src/infrastructure/observability/metrics-cache.ts`** — exports `cacheInvalidationFailuresTotal`, used for failure instrumentation on invalidation.
- **`src/infrastructure/runtime/environment.ts`** — provides `environmentNumber` for reading `NODE_REDIS_CACHE_MAX_BYTES` with a floor of 1.
- **Module route files** (`account`, `cart`, `feedback`, `locales`, `orders`, `products`, `users`) — mount `setCache` on their GET routes, supplying `seconds` and `CacheOptions`.
- **`tests/unit/infrastructure/http/middlewares/cache.test.ts`** — unit tests for the middleware's key derivation, TTL clamp, size gate, and hit/miss paths.
- **`tests/support/routes.ts`** — test fixture routes that exercise the cache middleware in integration contexts.

## Notes

- **`keyParameters` is a correctness contract, not a performance hint.** Omitting a parameter the controller actually reads means two different questions share one entry. Most routes declare `[]`; search routes derive theirs from their Zod schema.
- **Body is checked before query** when building the key, mirroring the `search` controller's own precedence. Reversing this would produce a key that disagrees with the value the controller reads.
- **`keyAs` replaces both method and path** in the key prefix. It exists for the four search endpoints where `GET /products?text=x` and `POST /products/search` answer the same question.
- **Only 2xx responses are stored.** A 4xx/5xx is never cached, so errors don't become sticky.
- **`Object.hasOwn` is used deliberately** (not `in`) when filtering `keyParameters`, to avoid prototype-chain false positives (e.g. a param named `toString`).
- **The `noStore` guard throws at request time**, not registration time, because `response.locals.noStore` is set by an upstream router-level middleware whose mount order is only known at runtime.
- **Dev TTL clamp applies at the `setCache` entry point**, not at write time, so the `Cache-Control: max-age` header advertises the same lifetime the server honours.
