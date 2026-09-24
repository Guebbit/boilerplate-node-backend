---
source: tests/integration/translation-cache-invalidation.test.ts
sha256: 41f838e47e1cf7d41cd8152d88c8ba768db2cbbbbfca92ddfa49cb498cbc11e2
generated_at: 2026-09-23T20:07:47.499129+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/translation-cache-invalidation.test.ts

## Purpose

End-to-end integration test proving that a successful `PATCH /locales/translations/product/:id` invalidates the `products` cache tag so the next anonymous `GET /products/:id` re-renders. It exists because the locales module and the products module each declare their cache tag independently; nothing type-checks the two strings against each other, so a silent typo would let stale products serve indefinitely. The test drives the real app over HTTP and asserts on `x-cache` response headers rather than on mock call counts.

## Key elements

- **`jest.mock('@infrastructure/adapters/cache', …)`** — in-memory cache double that tracks keys by tag. Implements `getCacheValue`, `setCacheValue` (tag-aware), `invalidateCacheTags`, and a separate `invalidateCacheTagsLogged` binding (see Notes).
- **`setupTestDb()`** — initialises the test database before any test runs.
- **`FALLBACK`** — constant `'en'`; the fallback locale assumed present in every test environment.
- **Test: "serves a second identical read from cache, then re-renders it after a PATCH"** — asserts the MISS → HIT → (PATCH) → MISS → new-title sequence.
- **Test: "does not clear the cache when the write was refused"** — sends a PATCH with an unknown locale tag (`xx`), expects a 422, then confirms the product is still served from cache (`HIT`).

## Relationships

- **`src/modules/locales/factories.ts`** — supplies `makeLocale` to seed the fallback locale row.
- **`src/modules/locales/repository.ts`** — supplies `localeRepository.create` to persist that locale before the test begins.
- **`src/modules/products/tests/factories.ts`** — supplies `createProduct` to seed a product with a known title.
- **`tests/support/http.ts`** — supplies `api()` (unauthenticated HTTP client) and `authenticateAs` (returns a bearer token) for all requests.
- **`tests/support/setup-test-db.ts`** — supplies `setupTestDb` to point the app at a disposable database.

## Notes

- **`invalidateCacheTagsLogged` must be re-mocked explicitly.** `jest.requireActual` captures the real module's local binding _before_ the mock factory runs, so the real `invalidateCacheTagsLogged` still calls the real Redis. The mock re-declares it against the same in-memory double; omitting this makes every write hit unreachable Redis and the test appears to pass.
- The `x-cache` header (`MISS` / `HIT`) is the primary assertion target, not the response body alone. This mirrors the convention in `locale-cache-invalidation.test.ts` for the tier-1 dictionary.
- `en` is treated as the universal fallback locale (documented in `.env-example`); tests will fail in an environment where that is not the case.
- The refused-write test (422) is intentionally included to guard against a regression where the handler invalidates the tag _before_ validation, clearing the cache even though no data changed.
