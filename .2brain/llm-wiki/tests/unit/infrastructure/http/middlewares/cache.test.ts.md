---
source: tests/unit/infrastructure/http/middlewares/cache.test.ts
sha256: aa9c1af60bdb4d301bba7a9e27ed284a7277ac185913828c92bfcb3434615fc6
generated_at: 2026-09-23T20:20:44.527585+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/cache.test.ts

## Purpose

Unit tests for the HTTP response-cache middleware. The file exercises key generation, header emission, envelope parsing, TTL clamping, the size gate, and the refresh-ahead path against the **real** middleware implementations, stubbing only the Redis transport (`@infrastructure/adapters/cache`) and the logger so the tests stay quiet.

## Key elements

- **`createResponse()`** – Builds a mock Express `Response` whose `vary()` **appends** (matching Express/CORS behavior) and whose `set`/`status`/`json`/`on` are jest spies. Returns `{ response, headers, listeners }` for assertions.
- **`keyFor(query, keyParameters, originalUrl?)`** – Drives a GET through `setCache` and returns the cache key that was looked up.
- **`bodyKeyFor(body, keyParameters, keyAs?)`** – Same for a POST body; paired with `sharedQueryKeyFor` to verify that `keyAs` unifies the two spellings.
- **`sharedQueryKeyFor(query, keyParameters, keyAs?)`** – GET spelling with an explicit `keyAs`, enabling cross-transport key comparisons.
- **`storeThrough(body, seconds?)`** – Forces a MISS, lets the "controller" set a status code and body, then lets `afterEach`-style assertions inspect the `setCacheValue` call.
- **`freshEnvelope(body)` / `staleEnvelope(body)`** – Produce JSON envelopes with `staleAt` set to now+60 s (HIT) or now−1 s (refresh-ahead).
- **`staleGetRequest()`** – Convenience GET stub used by the refresh-ahead cases.
- **`describe('setCache', …)`** – Main suite covering: cache HIT, corrupt-entry degradation, Redis rejection forwarding, store-on-MISS (including auth-scoped keys and TTL+grace math), TTL clamping under `NODE_REDIS_CACHE_DEV_TTL_MAX`, and (truncated) further cases for `keyAs` unification, size gate, `noStore`, `invalidateCache`, and `resolveCacheTtl`.
- **Mocks** – `@infrastructure/adapters/cache` (all four functions) and `@infrastructure/adapters/logger` (all four levels) are `jest.mock`ed at module level.
- **Env-var hygiene** – Originals of `NODE_ENV`, `NODE_REDIS_CACHE_DEV_TTL_MAX`, and `NODE_REDIS_CACHE_MAX_BYTES` are captured before the suite and restored in `afterEach`.

## Relationships

- **`src/infrastructure/http/middlewares/cache.ts`** – The module under test. Imports `setCache`, `invalidateCache`, `noStore`, and `resolveCacheTtl` directly.
- **`src/infrastructure/adapters/cache.ts`** – The Redis adapter; every function is mocked so no real Redis I/O occurs. Tests assert on the exact arguments passed to `getCacheValue`, `setCacheValue`, and `invalidateCacheTagsLogged`.
- **`src/infrastructure/observability/metrics-cache.ts`** – `cacheRequestsTotal` is imported (visible at the top) for metric-emission assertions in the truncated portion of the suite.
- **`tests/support/stub.ts`** – `asStub` is used to create minimally-typed `Request`/`Response`/`NextFunction` objects, breaking the circular `this`-return type inference of Express stubs.

## Notes

- Under jest `NODE_ENV` is `'test'`, so the **development TTL ceiling** is active by default. Any test that is *not* about clamping must explicitly set `NODE_REDIS_CACHE_DEV_TTL_MAX=0` ("no cap"), otherwise every declared TTL is silently clamped to 30 s.
- The `vary` mock deliberately **appends** to an existing `Vary` header (comma-separated) rather than replacing it, mirroring Express' real behavior and the `Vary: Origin` header already set by CORS. A replace-based mock would let a test pass while production drops a required header.
- The logger mock exists solely to silence the size-gate rejection log so a passing test run produces no output.
- The `asStub` call inside `createResponse` is annotated: without it, TypeScript inference would be circular because the stub's own callbacks reference `response`.
- `src/kernel/registry.ts` appears as a graph neighbor but has no visible import or interaction in this file.
