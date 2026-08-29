# tests/unit/infrastructure/http/middlewares/cache.test.ts

## Purpose

Unit tests for the HTTP response-cache middleware (`setCache` and friends). The file exercises everything the middleware *decides*—cache-key construction, response headers, TTL clamping, the size gate, and corrupt-entry recovery—against real implementations, while stubbing only the Redis round-trip (`getCacheValue` / `setCacheValue` / `invalidateCacheTags`).

## Key elements

- **`createResponse()`** — Builds a realistic Express `Response` stub. Notable detail: `vary` *appends* (matching Express semantics and the existing `Vary: Origin` from CORS) rather than overwriting.
- **`keyFor(query, keyParameters)`** — Drives a GET request through `setCache` and returns the cache key the adapter received.
- **`bodyKeyFor(body, keyParameters, keyAs?)`** / **`sharedQueryKeyFor(query, keyParameters, keyAs?)`** — POST-body and GET-query variants that share a `keyAs` prefix, used to verify transport/method unification.
- **`storeThrough(body, seconds?)`** — Drives a cache MISS, then calls `response.json()` to trigger the post-handler store path.
- **`describe('setCache')`** — Core test block covering: cache HIT (status/body replay, `x-cache: HIT`), corrupt-entry → MISS (no throw), store-after-handler (key includes auth + locale), TTL clamping via `NODE_REDIS_CACHE_DEV_TTL_MAX`, and `Vary: Authorization, Accept-Language` + `Cache-Control` for guest vs. authenticated scopes.
- **Environment save/restore** — `afterEach` restores `NODE_ENV`, `NODE_REDIS_CACHE_DEV_TTL_MAX`, and `NODE_REDIS_CACHE_MAX_BYTES` to their pre-test values.
- **Mocks** — `@infrastructure/adapters/cache` (three functions) and `@infrastructure/adapters/logger` (silenced to keep size-gate refusals quiet).

## Relationships

- **`src/infrastructure/http/middlewares/cache.ts`** — System under test. Imports `setCache`, `invalidateCache`, `noStore`, `resolveCacheTtl`.
- **`src/infrastructure/adapters/cache.ts`** — Fully mocked via `jest.mock`; the tests assert on the arguments passed to `getCacheValue` / `setCacheValue` and the return value of `getCacheValue`.
- **`tests/support/stub.ts`** — Provides `asStub<T>()` to create type-safe generic stubs for `Request`, `Response`, and `NextFunction` without pulling in a full Express instance.

## Notes

- `NODE_ENV` is `'test'` under Jest, so the development TTL ceiling is active in every test by default. Tests that are *not* about clamping set `NODE_REDIS_CACHE_DEV_TTL_MAX=0` (meaning "no cap") in `beforeEach`; without this, every declared TTL would silently arrive as 30 s.
- The `asStub` call for `Response` is annotated because the stub's own callbacks (`set`, `status`, `vary`) return `response`, which would make TypeScript inference circular.
- The `vary` mock appends with a comma to mirror real Express behaviour; a naive overwrite would let a test pass while the production response drops the CORS-provided `Vary: Origin`.
- Corrupt-entry tests assert that a `JSON.parse` failure degrades to `x-cache: MISS` + `next()` call rather than a 500—this is the middleware's responsibility, not the adapter's.
