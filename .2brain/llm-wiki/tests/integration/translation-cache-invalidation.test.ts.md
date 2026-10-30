---
source: tests/integration/translation-cache-invalidation.test.ts
sha256: e44aad0607c3ff429b75e7f68d261de1dddf0570469bd0a44941a4df738caee6
generated_at: 2026-10-29T07:04:18.642077+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/translation-cache-invalidation.test.ts

## Purpose

End-to-end integration test that a translation write (via the `locales` module) correctly invalidates the `products` cache tag so the next anonymous reader sees fresh data. It exists because the two modules share a bare cache-tag string with no type-level link; a typo in either module would pass all unit tests silently. Only driving the real HTTP stack and asserting on the `cache-status` response header can catch that.

## Key elements

- **`jest.mock('@infrastructure/adapters/cache', …)`** — Replaces the Redis-backed cache with an in-memory map keyed by tag. Critically, it re-declares `invalidateCacheTagsLogged` against the same double (see Notes).
- **`readInItalian(id)`** — Helper that GETs a product with `Accept-Language: it` and returns `{ title, cache: 'HIT' | 'MISS' }` parsed from the `cache-status` header.
- **`describe('a translation write invalidates the cached product it translated')`**
  - *Serves a second identical read from cache, then re-renders it after a PATCH* — Verifies miss → hit → (PATCH) → miss → new title.
  - *Does not clear the cache when the write was refused* — Sends a PATCH with an unknown locale code (`xx`), expects 422, then asserts the cache entry is still a HIT.
- **`describe('switching a language off or on re-renders the cached products')`**
  - *Keeps a draft language out of the cache, serves it once on, and drops it again off* — Cycles `it` through inactive → active → inactive and asserts the served title and cache state at each step.

## Relationships

- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the in-memory test database before the suite runs.
- **`tests/support/http.ts`** — `api()` builds the Supertest request chain; `authenticateAs('admin')` returns a bearer token for authenticated writes.
- **`src/modules/products/tests/factories.ts`** — `createProduct({ title })` seeds a product row.
- **`src/modules/locales/tests/factories.ts`** — `givenLocale(code, opts?)` seeds a locale (optionally inactive).

## Notes

- **`invalidateCacheTagsLogged` mock pitfall:** The real implementation calls `invalidateCacheTags` through a module-local binding captured at import time, *before* the jest factory runs. Overriding only `invalidateCacheTags` in the mock is insufficient; the mock must explicitly re-declare `invalidateCacheTagsLogged` to route through the in-memory double. Without this, writes "succeed" against unreachable real Redis and the test passes vacuously.
- **Cache-state assertions use the `cache-status` header** (RFC 9211 style: `fwd=miss` for misses, `; hit; ttl=N` for hits) rather than inspecting internal store state, keeping the test black-box.
- **`FALLBACK = 'en'`** is hard-coded and depends on `.env-example` documenting `en` as the fallback locale in every environment this suite targets.
