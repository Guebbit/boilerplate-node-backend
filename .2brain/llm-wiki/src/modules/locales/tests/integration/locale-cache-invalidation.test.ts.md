---
source: src/modules/locales/tests/integration/locale-cache-invalidation.test.ts
generated_at: 2026-11-22T05:49:57.761845+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/tests/integration/locale-cache-invalidation.test.ts

## Purpose
End-to-end integration test that an admin write in the locales module invalidates the cached public reads (`GET /locales`, `/locales/:locale`, `/locales/:locale/messages`). The read stores a response under a cache tag and the write clears a tag, and nothing type-checks that the two match. A mismatch would go unnoticed in development, where the TTL is clamped to 30 seconds, and would serve hour-old translations in production. The test asserts that the cached response disappears, not that `invalidateCacheTags` was called with a string.

## Key elements
- **`jest.mock('@infrastructure/adapters/cache', ...)`**: replaces the Redis cache adapter with an in-memory double and spreads the real module via `jest.requireActual`.
  - A `responses` Map holds one entry per key, and a `tagged` Map holds a Set of keys per tag.
  - `getCacheValue` reads from `responses`.
  - `setCacheValue` ignores a TTL <= 0 and otherwise stores the value and registers its key under each tag.
  - `invalidateCacheTags` deletes the keys under each tag and resolves `{ deleted, reachable: true }`.
  - `invalidateCacheTagsLogged` is redeclared against the same double and resolves `undefined`.
- **`givenPublishedLanguage(bearer)`**: creates language `pt` (`POST /locales`) and entry `cart.title` under the `demo-fe` app through the real admin routes.
- **`cacheStatusOf(path)`**: returns the `cache-status` header of an anonymous GET.
- **Test groups**:
  - *an admin write invalidates the cached public dictionary*:
    - Asserts miss, then hit, then miss with the new value after a PUT edit.
    - Asserts that creating a language clears the cached manifest.
  - *an edit clears only its own language*:
    - Editing `pt` leaves the cached `es` dictionary and `es` row as hits, while `pt` and the manifest miss.
    - A path in another case (`/locales/PT/messages`) is cleared by an edit to `pt`.
  - *the cached dictionary is per app*: after a warm read of `?app=demo-fe`, `?app=kiosk` returns the kiosk dictionary as a miss.
  - *a body on a GET never reaches the cache key*: a GET that sends `{ app: 'kiosk' }` in its body while the query says `demo-fe` must not store the demo-fe dictionary under the kiosk key.

## Relationships
- `tests/support/setup-test-db.ts`: `setupTestDb()` is called at module level to set up the database for the suite.
- `tests/support/http.ts`: `api()` is the HTTP client used against the real app, and `authenticateAs('admin')` supplies the bearer token for write requests.
- `tests/support/environment.ts`: `setEnvironment({ NODE_LOCALE_APPS_EXTRA: 'kiosk=Kiosk' })` registers a second frontend app in the per-app tests.

## Notes
- The cache is doubled because the real adapter's `getCacheValue` resolves `undefined` on any failure, so without Redis every request misses and a test against the real adapter would pass without proving anything.
- `invalidateCacheTagsLogged` must be overridden explicitly. The real one calls `invalidateCacheTags` through a module-local binding that `requireActual` captured before the factory ran, so overriding the export alone does not reach it.
- Each invalidation test asserts a proven HIT before the write. Without that, a later MISS would prove nothing.
- The assertions read the `cache-status` header. Hits match `/; hit; ttl=\d+/` and misses contain `fwd=miss`.
- The TTL clamp and the stored envelope in `http/middlewares/cache.ts` are deliberately not stubbed. The clamp decides whether anything is cached outside production.
