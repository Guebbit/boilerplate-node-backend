# tests/integration/locale-cache-invalidation.test.ts

## Purpose

End-to-end integration test that proves a write to the locales routes actually removes the cached public dictionary response, so the next anonymous reader sees fresh data. It drives the real app over HTTP and asserts on `x-cache: MISS|HIT` headers rather than on spy-call arguments, guarding against the tag-string mismatch between the read path (stores under `'locales'`) and the write path (clears `'locales'`) that nothing type-checks.

## Key elements

- **`jest.mock('@infrastructure/adapters/cache', …)`** — replaces the cache adapter with a `Map`-based double implementing `getCacheValue`, `setCacheValue` (respects `ttlSeconds <= 0` guard), and `invalidateCacheTags` (returns `{ deleted, reachable: true }`). Only the adapter is faked; the TTL clamp and envelope logic in `http/middlewares/cache.ts` run for real.
- **`givenPublishedLanguage(bearer)`** — helper that POSTs a language (`/locales`) and one entry (`/locales/pt/entries`) through the real admin routes, seeding state for the other two tests.
- **Test 1 — "serves a second identical read from cache, then re-renders it after an edit"** — asserts MISS → HIT → (PUT entry) → MISS with the updated value, proving the write cleared the exact key the read stored.
- **Test 2 — "clears the manifest too"** — asserts `/locales` (the language manifest) goes MISS → HIT → (POST new language) → MISS with the new tag present, covering the manifest endpoint that shares the same cache tag.
- **Test 3 — "does not clear the cache when the write was refused"** — issues a DELETE that returns 409, then asserts the cached response is still a HIT, confirming invalidation only fires on 2xx.

## Relationships

- **`tests/support/http.ts`** — supplies `api()` (supertest-style request builder) and `authenticateAs('admin')` (returns a `bearer` token). All HTTP calls in this file go through these helpers.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called once at module scope to reset/populate the test database before any request hits the app.

## Notes

- The adapter double is intentional: the real adapter's `getCacheValue` resolves `undefined` on any connection failure, so a test against live Redis would silently pass on a machine with no Redis while proving nothing. The fake mirrors the two-family semantics (key-per-response, set-per-tag) without that failure mode.
- The TTL clamp middleware (`http/middlewares/cache.ts`) is **not** stubbed. In non-production the clamp shortens TTL to 30 s; the mock's `setCacheValue` still stores the value, so the test exercises the clamp path rather than bypassing it.
- Assertions rely on the `x-cache` response header (`MISS`/`HIT`) set by the real middleware, not on internal spy calls.
- Test 3 guards against a regression where `invalidateCache` fires unconditionally on write attempts rather than only on 2xx success.
