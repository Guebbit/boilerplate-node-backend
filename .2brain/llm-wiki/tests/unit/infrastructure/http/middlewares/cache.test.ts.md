---
source: tests/unit/infrastructure/http/middlewares/cache.test.ts
sha256: 45dfb77a8fbf1aeac7963e68e88cf8617f590f2298f9a23d271d1cd50fc7b7fe
generated_at: 2026-09-27T16:06:32.864910+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/cache.test.ts

## Purpose

Unit tests for the HTTP response-cache middleware (`setCache` and friends). The file exercises the middleware's own decisions—cache-key construction, response-header management, envelope format, TTL clamping, and the byte-size gate—while stubbing only the Redis round-trip so the real TTL-clamp and size-limit code runs unmocked.

## Key elements

- **`GUEST_SCOPE`** – A `scopeKey` that always returns `true`; used as the default caller identity so most tests share the same scope segment in the cache key.
- **`createResponse()`** – Builds a mock Express `Response` whose `set`, `status`, `vary`, `json`, and `on` methods record calls into a local `headers` map and `listeners` map, returned alongside the stub.
- **`keyFor` / `bodyKeyFor` / `sharedQueryKeyFor`** – Helpers that drive one request through `setCache` and return the cache key the middleware looked up, for GET-query, POST-body, and `keyAs`-unified comparisons respectively.
- **`storeThrough(body, seconds)`** – Drives a MISS through the middleware and lets the "controller" answer with a given body; used to assert what is written to the cache.
- **`freshEnvelope` / `staleEnvelope`** – JSON envelope constructors representing entries inside vs. past the soft TTL.
- **`describe('setCache', …)`** – Test blocks covering: HIT from Redis, corrupt-entry degradation to MISS, Redis-failure forwarding to `next()`, storing 2xx responses with the guest scope, TTL clamping under `NODE_REDIS_CACHE_DEV_TTL_MAX`, and (truncated) further cases.
- **Mock setup** – `jest.mock` on `@infrastructure/adapters/cache` (four functions) and `@infrastructure/adapters/logger` (all log levels), keeping the run quiet while still asserting on cache-adapter calls.
- **Env-var save/restore** – `afterEach` restores `NODE_ENV`, `NODE_REDIS_CACHE_DEV_TTL_MAX`, and `NODE_REDIS_CACHE_MAX_BYTES` to their pre-suite values.

## Relationships

- **`src/infrastructure/http/middlewares/cache.ts`** – Module under test. The test imports `setCache`, `resolveCacheTtl`, `noStore`, and `invalidateCache` and asserts their observable behavior (headers, key shape, stored envelope, forwarded errors).
- **`src/infrastructure/adapters/cache.ts`** – Fully mocked. `getCacheValue`, `setCacheValue`, `invalidateCacheTagsLogged`, and `claimCacheRefresh` are `jest.fn()`s; tests assert call arguments and return values to verify the middleware's storage contract.
- **`src/infrastructure/observability/metrics-cache.ts`** – `cacheRequestsTotal` is imported, indicating tests assert that the middleware emits cache-request metrics.
- **`tests/support/stub.ts`** – Provides the `asStub<T>` generic used to cast plain objects into typed Express `Request`/`Response`/`NextFunction` instances without pulling in the full Express runtime.

## Notes

- Under Jest `NODE_ENV` is `'test'`, so the **development TTL ceiling** is active by default. Any test that is *not* about clamping must set `NODE_REDIS_CACHE_DEV_TTL_MAX=0` (meaning "no cap") in its `beforeEach`; otherwise every declared TTL silently becomes 30 s.
- The `vary` mock **appends** (comma-joins) rather than overwrites, mirroring Express's real behavior and the fact that CORS already adds `Vary: Origin`. A naïve replace-style mock would let a test pass while the real response drops a required header.
- The logger is mocked to silence the size-gate warning log; a passing run should be quiet, and any unexpected log output signals an unhandled path.
- The cache envelope is a JSON string `{ status, body, staleAt }`; the adapter stores opaque bytes, so **parse-failure handling lives in the middleware**—hence the dedicated corrupt-entry test.
