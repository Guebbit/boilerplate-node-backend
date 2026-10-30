---
source: src/modules/locales/tests/integration/locale-cache-invalidation.test.ts
sha256: 8d210ed53ab86ac7f01e6e41d27420f5c94005e6caca3b67fa1cdafdea57aaf6
generated_at: 2026-10-29T04:25:48.132816+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/integration/locale-cache-invalidation.test.ts

## Purpose

Integration test that drives the real HTTP stack end-to-end to verify admin writes to the locale routes actually evict the cached public dictionary (and manifest), rather than merely asserting that an invalidation function was invoked. It exists because the read-tag and write-tag are two untyped strings that nothing in the compiler links together; a mismatch would be invisible in development (TTL clamped to 30 s) but would serve stale translations for an hour in production.

## Key elements

- **Cache adapter mock (`jest.mock('@infrastructure/adapters/cache', …)`)** — In-memory double using two `Map`s (key → response, tag → Set of keys) that replicates the real adapter's two-family semantics. Only the adapter is replaced; the TTL-clamp middleware in `http/middlewares/cache.ts` still runs. `setCacheValue` honours the non-positive-TTL "do not cache" guard. `invalidateCacheTagsLogged` is redeclared against the same double (see Notes).
- **`givenPublishedLanguage(bearer)`** — Helper that registers a language (`pt`) and one key (`cart.title → Carrinho`) through the real admin routes via `POST /locales` and `POST /locales/:locale/apps/demo-fe/entries`.
- **Test: "serves a second identical read from cache, then re-renders it after an edit"** — Asserts the canonical MISS → HIT → edit → MISS sequence on `GET /locales/pt/messages`, checking `cache-status` headers and body content at each step.
- **Test: "clears the manifest too, so a new language is visible immediately"** — Verifies `GET /locales` (the language manifest) is also invalidated when a new locale is created.
- **Test: "answers ?app=b with b's dictionary after a warm read of a"** — Uses `setEnvironment` to add a second frontend app (`kiosk`), then confirms that a warm cache hit for `?app=demo-fe` does not bleed into a read for `?app=kiosk`.

## Relationships

- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises a per-test-database so the real Mongo-backed locale routes can be exercised.
- **`tests/support/http.ts`** — Provides the `api` HTTP client (supertest-style) and `authenticateAs` (returns a bearer token for a given role). All requests in this file go through these helpers.
- **`tests/support/environment.ts`** — `setEnvironment` is called to inject `NODE_LOCALE_APPS_EXTRA`, which makes the app register a second frontend app (`kiosk`) so the per-app cache test has two apps to distinguish.

## Notes

- **Only the adapter is mocked, not the middleware.** The TTL clamp and the stored envelope in `http/middlewares/cache.ts` run for real. Stubbing them would let the suite pass against a configuration where the middleware caches nothing.
- **`invalidateCacheTagsLogged` must be redeclared in the mock.** The real implementation calls `invalidateCacheTags` through a module-local binding captured at import time (before the `jest.mock` factory runs), so simply overriding the named export does not reach it. The mock redefines `invalidateCacheTagsLogged` to call the in-memory `invalidateCacheTags` directly.
- **The double returns `{ deleted, reachable: true }`.** The real adapter reports reachability so the middleware can count a write whose stale response survived; always returning `true` here keeps that path exercised without a live Redis.
- **Cache assertions rely on the `cache-status` response header** (`fwd=miss` vs `hit; ttl=…`), not on internal state, making the test a true black-box check of the wire contract.
