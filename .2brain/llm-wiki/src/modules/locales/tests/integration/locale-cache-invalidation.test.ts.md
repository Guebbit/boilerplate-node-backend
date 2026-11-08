---
source: src/modules/locales/tests/integration/locale-cache-invalidation.test.ts
sha256: 8d210ed53ab86ac7f01e6e41d27420f5c94005e6caca3b67fa1cdafdea57aaf6
generated_at: 2026-11-08T06:27:50.837108+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/integration/locale-cache-invalidation.test.ts

## Purpose

End-to-end integration test that proves the cache tag declared by the public locale READ routes is the same tag cleared by the admin WRITE routes. It drives the real HTTP app (with the real TTL-clamp middleware) and asserts on `cache-status` response headers that a cached dictionary response is actually gone after an admin edit, rather than merely asserting that `invalidateCacheTags` was called.

## Key elements

- **`jest.mock('@infrastructure/adapters/cache')`** — In-memory double implementing the two-family semantics (a `responses` Map keyed by cache-key, a `tagged` Map of tag→Set\<key\>). Replaces only the adapter; the TTL clamp in `http/middlewares/cache.ts` still executes for real.
- **`invalidateCacheTags` (inside the mock)** — Deletes all keys registered under the given tags from `responses`; returns `{ deleted, reachable: true }` to match the real adapter's contract.
- **`invalidateCacheTagsLogged` (inside the mock)** — Explicitly redeclared to call the local `invalidateCacheTags`; necessary because `jest.requireActual` captures the module-local binding before the mock factory runs.
- **`givenPublishedLanguage(bearer)`** — Helper that POSTs a new locale (`pt`) and one `demo-fe` entry (`cart.title` → `"Carrinho"`) through the real admin routes.
- **Test: "serves a second identical read from cache, then re-renders it after an edit"** — Verifies miss → hit → (admin PUT) → miss with the new value.
- **Test: "clears the manifest too, so a new language is visible immediately"** — Verifies the `GET /locales` list endpoint is also invalidated on `POST /locales`.
- **Test: "answers ?app=b with b's dictionary after a warm read of a"** — Confirms cache keys are per-app; a warm `demo-fe` read does not leak into a `kiosk` read.

## Relationships

- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module scope to seed/reset the MongoDB fixture before any test runs.
- **`tests/support/http.ts`** — Provides `api()` (supertest-style HTTP client against the running app) and `authenticateAs('admin')` which returns a Bearer token.
- **`tests/support/environment.ts`** — `setEnvironment` is used in the per-app test to inject `NODE_LOCALE_APPS_EXTRA=kiosk=Kiosk` so a second frontend app exists.

## Notes

- The cache adapter is deliberately doubled instead of using live Redis: the real adapter's `getCacheValue` resolves `undefined` on connection failure, so on a Redis-less machine every request is a miss and the test would pass while proving nothing.
- Only the adapter layer is mocked. The TTL clamp (which short-circuits caching to 30 s in non-production) runs in the real middleware; stubbing it would let the suite pass against a config where nothing is cached.
- The `invalidateCacheTagsLogged` override is a known `jest.mock` gotcha: `jest.requireActual` resolves the module's internal `const` binding before the factory executes, so the logged variant would otherwise call the real (unreachable) Redis.
- Tests assert on `cache-status` header values (`fwd=miss`, `hit; ttl=\d+`) rather than on internal call logs, ensuring the response truly round-tripped through the cache layer.
