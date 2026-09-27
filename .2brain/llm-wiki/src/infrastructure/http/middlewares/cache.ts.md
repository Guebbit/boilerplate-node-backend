---
source: src/infrastructure/http/middlewares/cache.ts
sha256: b3aa65e28c43bd8dea785bc741dd3e7da0423ac20559c958e2fe9997e254396f
generated_at: 2026-09-27T14:09:16.667533+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/cache.ts

## Purpose
Defines the HTTP response-caching layer: the `CachedResponse` envelope, the TTL resolution policy (including a development-time clamp), and a per-entry size gate. It sits between route handlers and the opaque `adapters/cache` store, owning everything specific to caching a *response* (JSON shape, `stale-while-revalidate` timing, byte budget) so that a non-HTTP consumer of the adapter inherits none of it.

## Key elements
- **`resolveCacheTtl(seconds)`** (exported) — Clamps a route's declared TTL to a development ceiling (`NODE_REDIS_CACHE_DEV_TTL_MAX`, default 30 s); returns the value unchanged in production or when the cap is `0`.
- **`CachedResponse`** (interface) — The stored envelope: `{ status, body, staleAt }`. `staleAt` marks the soft-expiry point before Redis' own TTL expires.
- **`CacheOptions`** (interface) — Per-route configuration: `tags`, `keyParameters`, `keyAs`, `browserRevalidate`, and the required `scopeKey` predicate that gates whether a key is built at all.
- **`STALE_WHILE_REVALIDATE_SECONDS`** (const, 60) — Grace window for serving a stale entry while one refresh is in flight; shared with edge caches via the `Cache-Control` header.
- **`STALE_IF_ERROR_SECONDS`** (const, 300) — Advertised `stale-if-error` value for edge caches; not enforced server-side.
- **`DEFAULT_MAX_CACHED_BYTES`** (const, 256 KiB) — Per-entry size limit; configurable via `NODE_REDIS_CACHE_MAX_BYTES`.
- **`getCacheKey(request, sortedKeyParameters, keyAs?)`** (internal) — Builds the deterministic key from identity + sorted parameter values + literal `guest` scope + locale.
- **`serializeCachedResponse` / `parseCachedResponse` / `isCachedResponse`** (internal) — Serialize, size-check, and shape-validate the envelope; a corrupt or oversized entry degrades to a cache miss, never a 500.

## Relationships
- **`src/infrastructure/adapters/cache.ts`** — The underlying store. This module calls `getCacheValue`, `setCacheValue`, `claimCacheRefresh`, and `invalidateCacheTagsLogged`; it adds the response-specific envelope, TTL clamp, and size gate on top.
- **`src/infrastructure/http/request.ts`** — Provides `bodyRecordOf`, used by `getCacheKey` to read JSON-body parameters (e.g. POST search) so the key matches what the controller actually reads.
- **`src/infrastructure/observability/metrics-cache.ts`** — Source of the `cacheRequestsTotal` counter; this middleware records hit/miss/stale outcomes against it.
- **`src/infrastructure/runtime/environment.ts`** — Supplies `environmentNumber`, the typed env-var reader used for both the dev-TTL cap and the max-bytes limit.
- **`src/infrastructure/adapters/logger.ts`** — Emits a `warn` when a response is skipped for exceeding the size gate.
- **Route files** (`account`, `addresses`, `cart`, `feedback`, `locales`, `orders`, `products`, `users`) — Consumers that declare a `CacheOptions` object per endpoint and receive the `setCache` / `serveOrArm` middleware behavior described in this module.
- **`tests/support/routes.ts`** — Test harness that exercises the cache middleware path.
- **`scripts/docs/generate-role-matrix.ts`** — Documentation tooling that references this module's scope/role conventions.

## Notes
- The key is built from **sorted** `keyParameters` (by name and, for arrays, by value) — raw query-string order is never part of the key, so `?a=1&b=2` and `?b=2&a=1` share one entry.
- `scopeKey` is a *gate*, not a discriminator: it returns `false` to bypass Redis entirely; the key always carries the literal `guest` segment. This means a wider-visibility caller never produces a distinct key.
- `keyAs` replaces **both** the method and path in the default identity, not just one half, so two different HTTP spellings of the same logical question (`GET /products?text=x` vs `POST /products/search`) collapse to one entry.
- The size gate is checked on the *serialized* bytes (`JSON.stringify`), not an estimate; exceeding it is a `warn` log + skip, not an error.
- `Object.hasOwn` (not `in`) is used when checking parameter presence to avoid prototype-chain false positives (e.g. a parameter named `toString`).
- The dev TTL clamp is applied at the `setCache` middleware entry point (where the TTL enters the system), not at write time, so the `Cache-Control: max-age` header always matches the actual server-side lifetime.
