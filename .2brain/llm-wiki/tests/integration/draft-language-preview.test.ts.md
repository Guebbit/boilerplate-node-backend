---
source: tests/integration/draft-language-preview.test.ts
sha256: 4cd1e90a6aa0a023e6533666f4de54dc78f7794a16996baf0c6ff44ddaaf9381
generated_at: 2026-11-14T23:13:21.292684+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/draft-language-preview.test.ts

## Purpose

Integration suite that verifies a staff credential holding `display:Locale` (but **not** `display:Product`) can preview a draft language's product text while the shared visitor cache is never polluted in either direction (preview doesn't read the cached live entry, and the live entry is never overwritten with draft data). Every test drives real routes against an in-memory Redis double; a dedicated canary test proves that double *would* share entries, so the suite cannot pass vacuously.

## Key elements

- **Cache mock factory** (`jest.mock('@infrastructure/adapters/cache', …)`) — in-memory double with `getCacheValue`, `setCacheValue` (tag-aware), `invalidateCacheTags`, plus test-only handles `storedValues()` and `clearStored()` that do not exist on the real adapter.
- **`givenDraftGerman(fields?)`** — fixture helper: creates an `en` product with a live title, an inactive `de` locale, upserts a draft German row via the translation repository, and calls `refreshLocaleOverrides`. Returns the product id.
- **`asking(language, bearer?)`** — builds the `Accept-Language` / `Authorization` header object for a request.
- **`READS`** — constant array of three endpoint descriptors (`GET /products`, `POST /products/search`, `GET /products/:id`), each exposing `read` and a `titleOf` body-shape extractor; consumed by `it.each` to run the same assertions across all catalogue read paths.
- **`describe('a staff credential…')`** — the core suite: canary (cache WOULD share), draft-uncached-both-directions, cold-cache ordering, field-by-field fallback, 304 with matching draft tag, 200 when visitor tag is sent to preview, draft-only search word, and live-language passthrough.
- **`describe('everyone else…')`** — anonymous visitor and `customer` role both get the live pick with a shared cache hit.
- **`describe('the oracle')`** — after admin activates the locale, a plain visitor's response is body-identical to the earlier preview.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure/i18n/index.ts` | Imports `registerLocaleOverrideProvider`, `refreshLocaleOverrides`, `resetLocaleOverrides` to wire and tear down the locale-overlay provider around each test. |
| `src/infrastructure/i18n/overrides.ts` | Backs the override mechanism the i18n index re-exports; exercised indirectly through `refreshLocaleOverrides` / `resetLocaleOverrides`. |
| `src/modules/locales/repository.ts` | Provides `translationRepository`, used by the `givenDraftGerman` helper to persist the draft locale row. |
| `src/modules/locales/services/index.ts` | Provides `localeService`, whose overlay-read method is registered as the override-provider callback in `beforeAll`. |
| `src/modules/locales/tests/factories.ts` | `givenLocale` creates the `en` / `de` locale documents. |
| `src/modules/products/tests/factories.ts` | `createProduct` seeds the product entity. |
| `tests/support/credentials.ts` | `credentialHolding(['display:Locale'])` mints the minimally-scoped Bearer token under test. |
| `tests/support/http.ts` | `api()` (supertest wrapper), `authenticateAs`, `authenticateAsRole` for admin / customer tokens. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` initialises the in-memory database at module scope. |

## Notes

- The canary test is **load-bearing**: it asserts that a staff request in a *live* language gets a cache `hit`. Without it, a broken cache mock could let the draft-uncached assertions pass trivially.
- `setupTestDb()` runs at **module top level**, not inside `beforeAll`; Jest executes it once per test file.
- The cache mock's `storedValues` / `clearStored` are **not** part of the real `@infrastructure/adapters/cache` interface — they exist solely so assertions can inspect what the double holds.
- `READS` uses `as const` so each entry's `titleOf` signature is narrowed per endpoint; adding a fourth endpoint requires a matching `titleOf` shape.
- The `en, de;q=0.5` test confirms that when the draft language is *not* the first preference, the response is served from the normal (cached) path and carries no `no-store` directive.
