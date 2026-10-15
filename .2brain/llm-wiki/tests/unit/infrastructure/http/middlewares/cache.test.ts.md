---
source: tests/unit/infrastructure/http/middlewares/cache.test.ts
sha256: dad19d71a70783b50216c86ec2e94c8b441f5f297f702bb30d580e0b59b65716
generated_at: 2026-10-15T13:11:43.779743+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/cache.test.ts

## Purpose

Unit tests for the HTTP response-cache middleware (`setCache`, `noStore`, `invalidateCache`, `resolveCacheTtl`). The file verifies key construction, header emission, TTL clamping, size gating, and the stale/fresh envelope lifecycle. Only the Redis round-trip adapter is stubbed; the real TTL clamp and byte-limit logic execute so they are tested against their actual implementations.

## Key elements

- **`GUEST_SCOPE`** – a `() => true` scope key used as the default in most tests, representing the ordinary unauthenticated caller.
- **`createResponse()`** – builds a fake Express `Response` with `set`, `status`, `vary` (append-semantics), `json`, and `on`; returns `{ response, headers, listeners }`.
- **`keyFor` / `bodyKeyFor` / `sharedQueryKeyFor`** – drive a single request through `setCache` and return the cache key the middleware looked up, enabling assertions on key shape across GET-query, POST-body, and `keyAs`-unified spellings.
- **`storeThrough`** – drives a MISS so the "controller" can answer with a body and the middleware stores the envelope.
- **`freshEnvelope` / `staleEnvelope`** – helpers that produce JSON envelope strings (`status`, `body`, `staleAt`) for HIT and stale-HIT scenarios.
- **`parseNumber` / `sortedBy`** – example `keyValues` implementations used to test custom key extraction.
- **`parsedKeyFor`** – drives a request through `setCache` with custom `keyValues` and `orderedKeyParameters`, returning the resulting key.
- **`describe('setCache')`** – the main block: covers HIT, MISS, corrupt-entry tolerance, Redis-failure forwarding to `next(error)`, storage under the guest scope, TTL clamping vs. `NODE_REDIS_CACHE_DEV_TTL_MAX`, size-gate rejection, `noStore`, `invalidateCache`, and `resolveCacheTtl`.

## Relationships

- **`src/infrastructure/http/middlewares/cache.ts`** — the system under test; the file imports `setCache`, `noStore`, `invalidateCache`, `resolveCacheTtl` and asserts on their behavior.
- **`src/infrastructure/adapters/cache.ts`** — fully mocked via `jest.mock`; provides `getCacheValue`, `setCacheValue`, `invalidateCacheTagsLogged`, `claimCacheRefresh` as the sole external boundary.
- **`src/infrastructure/observability/metrics-cache.ts`** — imports `cacheRequestsTotal`; the tests assert that the middleware emits the expected metric increments on HIT/MISS/STORE.
- **`tests/support/environment.ts`** — imports `setEnvironment` to toggle `NODE_REDIS_CACHE_DEV_TTL_MAX` on and off between test groups.
- **`tests/support/stub.ts`** — imports `asStub` for creating typed, minimally-shaped `Request` and `Response` objects without pulling in Express.

## Notes

- `NODE_ENV` is `'test'` under Jest, so the **development TTL ceiling is active by default**. Tests that are not specifically about clamping must call `setEnvironment({ NODE_REDIS_CACHE_DEV_TTL_MAX: '0' })` to lift the cap; otherwise every declared TTL silently becomes 30 s.
- The `vary` mock **appends** rather than replaces, mirroring Express semantics and the real CORS middleware that already sets `Vary: Origin`. A replace-style mock would let a test pass while the real response drops a required header.
- The adapter module is mocked, but the **logger is mocked separately** to silence the size-gate refusal log so passing runs stay quiet.
- `asStub` is used instead of plain object literals to keep TypeScript inference from becoming circular (the response's callbacks return `response` itself).
