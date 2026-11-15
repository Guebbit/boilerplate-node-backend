---
source: src/modules/locales/tests/integration/locale-cache-invalidation.test.ts
sha256: 48fc61e81e4de45bb42f8af39903c9b23e3665e7c830adc05197bd78bd608c05
generated_at: 2026-11-14T20:23:26.964736+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/integration/locale-cache-invalidation.test.ts

## Purpose

End-to-end integration test that proves an admin write to a locale entry or language list actually evicts the cached public dictionary response. It drives the real app (HTTP → middleware → routes) and asserts the stored response disappears by observing `cache-status` headers, rather than mocking the invalidation call. Its raison d'être is catching the class of bug where the tag written on the read path and the tag cleared on the write path disagree—undetectable in dev (TTL clamped to 30 s) but catastrophic in production (1-hour stale translations).

## Key elements

- **`jest.mock('@infrastructure/adapters/cache')`** — in-memory double (two `Map`s) replacing only the Redis adapter. Implements `getCacheValue`, `setCacheValue` (honours the `ttlSeconds <= 0` skip guard), `invalidateCacheTags`, and `invalidateCacheTagsLogged`. The TTL clamp and response envelope in `http/middlewares/cache.ts` are *not* stubbed and run for real.
- **`givenPublishedLanguage(bearer)`** — helper that POSTs a new language (`/locales`) and one entry (`/locales/pt/apps/demo-fe/entries`) through the real admin routes.
- **"an admin write invalidates the cached public dictionary"** — two tests: (1) GET dictionary → assert HIT on repeat → PUT entry → assert MISS + new value; (2) GET manifest → assert HIT → POST new language → assert MISS + new tag present.
- **"the cached dictionary is per app"** — registers entries under two apps (`demo-fe`, `kiosk`), warms the `demo-fe` cache, then asserts `?app=kiosk` is a separate MISS with different content.
- **"a body on a GET never reaches the cache key"** — sends `{ app: 'kiosk' }` in a GET body while the query says `demo-fe`; asserts the response is `demo-fe`'s and a subsequent honest `?app=kiosk` request is still a MISS.

## Relationships

- **`tests/support/setup-test-db.ts`** — calls `setupTestDb()` once at module scope to provision a clean test database before any route hits Mongo.
- **`tests/support/http.ts`** — supplies `api()` (supertest-style request builder) and `authenticateAs('admin')` used in every test for both authenticated writes and anonymous reads.
- **`tests/support/environment.ts`** — supplies `setEnvironment({ NODE_LOCALE_APPS_EXTRA: … })` to register a second frontend app (`kiosk`) so the per-app and cache-key-poisoning tests have two apps to distinguish.

## Notes

- The cache adapter is a **double, not a live Redis**, because the real adapter's `getCacheValue` resolves `undefined` on connection failure—on a machine without Redis every request would be a miss and a "cache hit" test would pass while proving nothing.
- `invalidateCacheTagsLogged` is **redeclared** inside the mock factory. The real implementation calls `invalidateCacheTags` via a module-local binding captured by `jest.requireActual` *before* the factory runs, so overriding only the named export would leave the logged variant calling through to the real (unreachable) Redis.
- Each test that expects a post-edit MISS **first asserts a confirmed HIT** on the intermediate read. Without that, a universal MISS (e.g., middleware caching disabled) would let the suite pass vacuously.
- The per-app cache key is derived from the **query parameter** `?app=`, never the request body. The last `describe` block guards against a future refactor that accidentally folds the body into the key.
