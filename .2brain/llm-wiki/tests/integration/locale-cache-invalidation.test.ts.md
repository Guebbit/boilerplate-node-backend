---
source: tests/integration/locale-cache-invalidation.test.ts
sha256: a96b5aeb32a9dd569119681bd4210f09607f0bd5f35b6cabc9a0eb298cf4cf30
generated_at: 2026-09-23T20:04:31.972269+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/locale-cache-invalidation.test.ts

## Purpose

Integration test that drives the real app end-to-end to verify the locale cache-invalidation contract: after an admin write, the cached public dictionary response is actually removed, so the next anonymous reader gets fresh data. It exists because the cache tag string used by reads and the tag cleared by writes are not type-checked against each other; a mismatch would look fine in development (30 s TTL) but silently serve hour-stale translations in production.

## Key elements

- **`jest.mock('@infrastructure/adapters/cache', …)`** — Replaces the Redis adapter with an in-memory `Map`-based double implementing `getCacheValue`, `setCacheValue` (respects `ttlSeconds <= 0` as "do not cache"), `invalidateCacheTags`, and `invalidateCacheTagsLogged`. Preserves the real adapter's two-family semantics (key-per-response, set-per-tag).
- **`givenPublishedLanguage(bearer)`** — Helper that creates a language (`pt`) and one entry (`demo-fe` / `cart.title` / `"Carrinho"`) through the real admin routes.
- **"serves a second identical read from cache, then re-renders it after an edit"** — Asserts MISS → HIT → (PUT entry) → MISS with the updated value, proving the write cleared the exact key the read stored.
- **"clears the manifest too, so a new language is visible immediately"** — Verifies that `GET /locales` (the manifest) is also invalidated when a new language is created.
- **"does not clear the cache when the write was refused"** — Confirms a 409 (refused delete) does **not** trigger invalidation, preventing a cache stampede on failed writes.

## Relationships

- **`tests/support/http.ts`** — Provides `api()` (HTTP client for the running app) and `authenticateAs('admin')` (returns a bearer token) used throughout every request.
- **`tests/support/setup-test-db.ts`** — Provides `setupTestDb()`, called once before the `describe` block to create/seed the test database.

## Notes

- **Why the adapter is a double, not live Redis:** `getCacheValue` resolves `undefined` on any failure, so on a machine without Redis every request is a miss and the test would pass while proving nothing. The Map-based double isolates exactly the assertion target: that the key the write clears is the key the read stored.
- **Only the adapter is mocked.** The TTL clamp and envelope logic in `http/middlewares/cache.ts` run for real; stubbing them would let the suite pass against a configuration where the middleware caches nothing.
- **`invalidateCacheTagsLogged` redeclaration:** The real implementation calls `invalidateCacheTags` through a module-local binding captured by `jest.requireActual` *before* the mock factory runs. The mock factory must redeclare it against the local `invalidateCacheTags`, otherwise every write "succeeds" against the unreachable real Redis.
- **`x-cache` header (MISS/HIT)** is the primary assertion mechanism—proving the response truly came from the store rather than the DB.
- **`demo-fe` tenant** is used because `GET /locales/:locale/messages` serves only that tenant's entries; it is the cached half this test targets.
- **`invalidateCache` fires only on 2xx.** The refused-write test (409) guards against a future change that would drop all cached locale responses on a failed request.
