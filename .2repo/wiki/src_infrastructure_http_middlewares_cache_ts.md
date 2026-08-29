# src/infrastructure/http/middlewares/cache.ts

## Purpose

Express middleware that caches **HTTP responses** in Redis. It owns the JSON envelope (`{status, body}`), the development TTL clamp, and the per-entry byte-size gate — concerns specific to caching a response rather than arbitrary data, which is why they live here rather than in the storage adapter.

## Key elements

- **`setCache(seconds, options)`** — Exported Express middleware factory. On a cache hit it replays the stored envelope; on a miss it lets the controller run, captures the response, and stores it. Applies the TTL clamp, size gate, and `Cache-Control` / ETag headers.
- **`resolveCacheTtl(seconds)`** — Exported. Returns the TTL unchanged in production; in other environments caps it at `NODE_REDIS_CACHE_DEV_TTL_MAX` (default 30 s).
- **`CacheOptions`** — `keyParameters` (required, declares which query/body params affect the key), `keyAs` (unifies GET/POST search routes under one key), `tags` (for invalidation), `browserRevalidate` (sends ETag + `no-store` so the browser revalidates instead of trusting a stale copy).
- **`getCacheKey(request, sortedKeyParameters, keyAs?)`** — Builds the key from `identity?params:userScope:locale`. Excludes the raw query string; sorts params at registration time; normalises values so `?page=1` and `{page:1}` share an entry.
- **`getCacheScope(request)`** — Isolates entries per user (`user:<id>` or `guest`).
- **`normalizeKeyValue(value)`** — Stringifies scalars and arrays so query-string and JSON-body spellings produce the same key token.
- **`serializeCachedResponse` / `parseCachedResponse`** — JSON-serialise with a byte-limit check (256 KB default, `NODE_REDIS_CACHE_MAX_BYTES`) and a safe parse that degrades a corrupt entry to a miss instead of a 500.

## Relationships

- **`src/infrastructure/adapters/cache.ts`** — Provides the raw `getCacheValue` / `setCacheValue` / `invalidateCacheTags` storage calls that this middleware wraps.
- **`src/infrastructure/adapters/logger.ts`** — `logger.warn` is called when a response is skipped for exceeding the size limit.
- **`src/infrastructure/observability/metrics-cache.ts`** — Imports `cacheInvalidationFailuresTotal` for tagging invalidation errors.
- **`src/infrastructure/runtime/environment.ts`** — `environmentNumber` reads `NODE_REDIS_CACHE_MAX_BYTES` with a floor of 1.
- **Module route files** (`products`, `orders`, `cart`, `users`, `account`, `feedback`, `locales`) — Consumers that call `setCache(ttl, { keyParameters, … })` at route registration.
- **`docs/tools/redis-cache.md`** — Authoritative reference for the TTL clamp, size-bound rationale, and writes-that-bypass-the-API behaviour.
- **`tests/unit/infrastructure/http/middlewares/cache.test.ts`** — Unit tests for the middleware.

## Notes

- **TTL clamp location:** Applied where the TTL enters the system (inside `setCache`), not at write time, so the `Cache-Control: max-age` header advertises the same lifetime the server actually honours.
- **`keyParameters` is required by design.** A wrong or missing list is a correctness bug (serving one user's search result to another), not just a missed optimisation.
- **`keyAs` replaces both halves** of the default `METHOD:path` prefix — it exists so `GET /products?text=x` and `POST /products/search` share one entry.
- **Body-before-query precedence** in key construction mirrors the search controller's own read order; reversing it would make the key disagree with the controller about which request it answers.
- **`Object.hasOwn`** (not `in`) is used for param presence checks to avoid prototype-chain false positives (e.g. a param named `toString`).
- **Size gate measures the serialised payload**, not an estimate. Exceeding it is logged and results in a normal (uncached) response — the endpoint stays correct.
- **`NODE_REDIS_CACHE_DEV_TTL_MAX=0`** disables the dev clamp entirely; non-numeric or negative values fall back to the 30 s default rather than allowing unlimited TTL.
