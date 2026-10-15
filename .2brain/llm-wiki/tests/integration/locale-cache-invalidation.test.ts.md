---
source: tests/integration/locale-cache-invalidation.test.ts
sha256: 89e02b0262ea6a2cf24e538b27415253d6a4a95db0ab81573f5d5defcb267466
generated_at: 2026-10-15T12:48:03.653432+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/locale-cache-invalidation.test.ts

## Purpose

Integration test that proves a locale write actually evicts the cached public dictionary (and manifest) end-to-end. It exists because the cache tag is two free strings separated by a segment — nothing type-checks them against each other — and a mismatch would pass in development (30 s TTL) but serve hour-stale translations in production. Rather than asserting a spy was called, it drives real HTTP requests through the app and checks the `x-cache` header transitions (MISS → HIT → MISS → updated body).

## Key elements

- **`jest.mock('@infrastructure/adapters/cache', …)`** — Replaces `getCacheValue` / `setCacheValue` / `invalidateCacheTags` with an in-memory `Map`-based double that mirrors the Redis adapter's two-family semantics (key-per-response, set-per-tag). `setCacheValue` honours the `ttlSeconds <= 0` guard (skip caching). `invalidateCacheTagsLogged` is redeclared against the same double (see Notes).
- **`givenPublishedLanguage(bearer)`** — Registers a language (`pt`) and one entry (`cart.title`) via real admin routes so the test has a cached public dictionary to work with.
- **`describe("an admin write invalidates the cached public dictionary")`** — Three cases:
  - *edit re-renders*: MISS → HIT → PUT entry → MISS + new value.
  - *manifest cleared*: `GET /locales` cached, then a new language POST makes the next `GET /locales` a MISS that includes the new tag.
  - *refused write does not evict*: a 409 DELETE leaves the dictionary cache intact (HIT).
- **`describe("the cached dictionary is per app")`** — Uses `setEnvironment` to add a second app (`kiosk`), then verifies `?app=kiosk` is a separate cache key (MISS) even after `?app=demo-fe` is warm (HIT).

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/setup-test-db.ts` | `setupTestDb()` is called at module top-level to prepare the test database before any request. |
| `tests/support/http.ts` | Provides `api()` (supertest wrapper) and `authenticateAs('admin')` for issuing requests and obtaining a bearer token. |
| `tests/support/environment.ts` | `setEnvironment({ NODE_LOCALE_APPS_EXTRA: … })` configures the extra frontend app needed by the per-app test. |

## Notes

- **Why a double instead of real Redis:** `getCacheValue` resolves `undefined` on *any* failure, so on a machine without Redis every read is a miss and the test would pass while proving nothing. The in-memory double makes the HIT/MISS distinction observable.
- **Only the adapter is mocked.** The TTL clamp and response-envelope logic in `src/…/http/middlewares/cache.ts` run for real; stubbing them would let the suite pass even if the middleware never caches.
- **`invalidateCacheTagsLogged` redeclaration:** The real implementation calls `invalidateCacheTags` through a module-local binding captured by `jest.requireActual` *before* the mock factory executes. Overriding only the bare export would cause logged invalidations to hit the real (unreachable) Redis. The mock re-declares `invalidateCacheTagsLogged` against the same in-memory double to close that gap.
- **Assertions target the `x-cache` header** (MISS/HIT) rather than call-spy counts, ensuring the test fails if the tag the read stores under differs from the tag the write clears.
