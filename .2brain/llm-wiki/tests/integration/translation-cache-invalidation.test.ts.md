---
source: tests/integration/translation-cache-invalidation.test.ts
sha256: e44aad0607c3ff429b75e7f68d261de1dddf0570469bd0a44941a4df738caee6
generated_at: 2026-11-08T09:49:30.817161+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/translation-cache-invalidation.test.ts

## Purpose

End-to-end integration test verifying that writing a translation (or activating/deactivating a locale) invalidates the `products` cache tag so the next anonymous `GET /products/:id` re-renders rather than serving a stale cached response. It exists because the `locales` module clears the `products` tag through a stringly-typed registry field—no type system links the two modules—so a typo or missing call would silently serve stale data for an hour.

## Key elements

- **`jest.mock('@infrastructure/adapters/cache', …)`** — In-memory cache double. Maintains two maps (`responses`, `tagged`) to emulate tag-based invalidation. Critically re-declares `invalidateCacheTagsLogged` against the same double, because the real implementation resolves `invalidateCacheTags` through a module-local binding that `jest.requireActual` captures before the factory runs.
- **`FALLBACK`** (`'en'`) — The fallback locale; asserted to exist in every environment via `.env-example`.
- **`readInItalian(id)`** — Helper that `GET`s a product with `Accept-Language: it` and returns `{ title, cache: 'HIT' | 'MISS' }` parsed from the RFC 9211 `cache-status` header.
- **Test: "serves a second identical read from cache, then re-renders it after a PATCH"** — Asserts miss → hit → (PATCH translation) → miss with new title.
- **Test: "does not clear the cache when the write was refused"** — A 422 (unknown locale `xx`) must leave the cached product untouched.
- **Test: "keeps a draft language out of the cache, serves it once on, and drops it again off"** — Locale activate/deactivate endpoints must each trigger a cache invalidation for affected products.

## Relationships

- **`tests/support/http.ts`** — Supplies `api()` (HTTP client) and `authenticateAs('admin')` used in every request.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module top-level to prepare a clean database before any test runs.
- **`src/modules/products/tests/factories.ts`** — `createProduct({ title })` seeds a product record for the suite.
- **`src/modules/locales/tests/factories.ts`** — `givenLocale(code, opts?)` ensures a locale row exists (optionally with `active: false`) before locale-related assertions.

## Notes

- The `invalidateCacheTagsLogged` re-declaration in the mock is load-bearing. Removing it causes writes to hit the real (unreachable) Redis, making every assertion about invalidation silently pass. The comment in the source explains the module-local-binding pitfall.
- Cache state is asserted via the `cache-status` response header (`fwd=miss` vs `hit; ttl=…`), not by inspecting internal store state. This keeps the test aligned with what an anonymous HTTP client would actually observe.
- The suite assumes `en` is the fallback locale; if a test environment changes that, the first two `describe` blocks will fail on the `expect(first.body.title).toBe('Old title')` assertion.
