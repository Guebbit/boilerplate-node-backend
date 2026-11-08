---
source: tests/unit/infrastructure/http/middlewares/cache.test.ts
sha256: 5a3fdd109574edc2888fdad0380e99842cab42fd62a6c338992c40349f1139ff
generated_at: 2026-11-08T10:13:21.880585+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/cache.test.ts

## Purpose

Unit tests for the HTTP response-cache middleware (`setCache`, `noStore`, `privateNoCache`, `markDraftPreview`, `invalidateCache`, `resolveCacheTtl`). The middleware is exercised with its **real** TTL-clamp and size-gate logic; only the Redis round-trip (the cache adapter) is stubbed. This ensures the TTL ceiling, byte-limit enforcement, envelope parsing, and key-generation behaviour are validated against production code rather than a mock.

## Key elements

- **`createResponse()`** – Builds a minimal Express `Response` stub whose `set`, `status`, `vary`, `json`, and `on` methods mutate a local `headers` map and `listeners` map. `vary` appends (matching Express semantics) rather than overwrites, so tests catch accidental header loss.
- **`GUEST_SCOPE`** – A no-op `scopeKey` (`() => true`) shared by most tests to keep keys deterministic.
- **`keyFor` / `bodyKeyFor` / `sharedQueryKeyFor`** – Helpers that run the middleware with a given query or POST body and return the cache key it looked up. Used to compare GET-query keys against POST-body keys under a shared `keyAs` alias.
- **`storeThrough`** – Drives a cache-miss through the middleware and lets the controller emit a JSON body, verifying the store path and headers.
- **`freshEnvelope` / `staleEnvelope`** – Produce JSON envelope strings (status, body, `staleAt`) representing a live entry vs. one past its soft TTL but inside Redis' grace window.
- **`parseNumber` / `sortedBy`** – Example `keyValues` callbacks for testing custom key-parameter parsing and `orderedKeyParameters`.
- **`parsedKeyFor`** – Runs the middleware with custom `keyValues` and/or `ordered` options and returns the resulting cache key.
- **`jest.mock('@infrastructure/adapters/cache', …)`** – Replaces `getCacheValue`, `setCacheValue`, `invalidateCacheTagsLogged`, `claimCacheRefresh` with `jest.fn()`s.
- **`jest.mock('@infrastructure/adapters/logger', …)`** – Silences the size-gate warning log so passing runs stay quiet.
- **`describe('setCache', …)`** – Top-level suite. `beforeEach` calls `setEnvironment({ NODE_REDIS_CACHE_DEV_TTL_MAX: '0' })` to remove the dev TTL cap unless a test is specifically about clamping.
- **Test cases (visible)** – cache hit, corrupt-entry → miss, Redis rejection → `next(error)`, store-on-miss with guest scope, TTL clamp behaviour, key equality across GET/POST transport, `keyValues` parsing, `orderedKeyParameters`.

## Relationships

- **`src/infrastructure/http/middlewares/cache.ts`** — Unit under test. All exported middleware/helpers are imported and invoked directly; no mocking of this module.
- **`src/infrastructure/adapters/cache.ts`** — Fully mocked at the module boundary. Tests assert on the exact key passed to `getCacheValue` and the arguments to `setCacheValue` / `invalidateCacheTagsLogged`.
- **`src/infrastructure/observability/metrics-cache.ts`** — `cacheRequestsTotal` is imported; individual tests (beyond the truncated portion) assert counter increments for hit/miss/store events.
- **`tests/support/environment.ts`** — `setEnvironment` is called in `beforeEach` (and per-test) to toggle `NODE_REDIS_CACHE_DEV_TTL_MAX`, which the real TTL-clamp code reads via `process.env`.
- **`tests/support/stub.ts`** — `asStub<T>()` provides type-safe partial-object creation for `Request`, `Response`, and `NextFunction` fixtures throughout the file.

## Notes

- **TTL cap default:** Under Jest, `NODE_ENV` is `'test'`, so the development TTL ceiling applies by default. Any test that is *not* about clamping must set `NODE_REDIS_CACHE_DEV_TTL_MAX=0` (meaning "no cap"); otherwise every declared TTL silently arrives as 30.
- **`Vary` header:** The response mock deliberately appends to the `Vary` value (e.g. `Origin, …`) because the real stack already carries `Vary: Origin` from CORS. A naive replace-in-mock would let a regression pass in test but drop a required header in production.
- **Key format:** Cache keys follow the pattern `METHOD:originalUrl?<sha256-of-sorted-params>:<scope>:<locale>`, verified with `createHash('sha256')` in the hit test.
- **Adapter boundary:** The adapter stores opaque bytes and never parses the envelope. Corrupt-entry and Redis-failure handling therefore *must* live in the middleware layer, and these tests guard that contract.
