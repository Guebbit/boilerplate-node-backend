---
source: tests/integration/translation-resolution.test.ts
sha256: 5fc3be15d9337e6dbb1d3b118f124f62a9584b242200c85aae5d617fa2ed8fbe
generated_at: 2026-11-08T09:49:43.330446+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/translation-resolution.test.ts

## Purpose

Integration tests for the **read half** of the translation system: verifying that product endpoints (`GET /products/:id`, `GET /products`, and free-text search) resolve titles in the caller's negotiated language. It lives at the top level rather than under either module's `tests/` because the assertion spans two modules — the `products` read path and the `locales` translation rows it depends on.

## Key elements

- **`FALLBACK`** (`'en'`) — locale assumed as the default in every test environment (see `.env-example`).
- **`givenTranslation(productId, locale, title)`** — convenience wrapper around `translationRepository.upsertEntityLocale`; sets `source: 'digest'` for non-fallback locales and `undefined` for the fallback.
- **`describe: "GET /products/:id resolves to the caller's language"`** — single-product resolution, fallback-to-source-title, and region-tag → base-language matching (`it-CH` → `it`).
- **`describe: "GET /products resolves a whole page in one batched query"`** — page-level batched translation; mixed translated/untranslated items on the same page.
- **`describe: "free-text search follows the caller's locale"`** — `text` and `title=` query params search both the source column *and* the translation row (union semantics), with negative-case coverage.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/locales/repository.ts` | `translationRepository.upsertEntityLocale` is called (via `givenTranslation`) to seed translation rows. |
| `src/modules/locales/tests/factories.ts` | `givenLocale` registers a locale so the API recognises it. |
| `src/modules/products/tests/factories.ts` | `createProduct` creates the product entity under test. |
| `tests/support/contract.ts` | Imported for HTTP response contract/type assertions. |
| `tests/support/http.ts` | `api()` provides the test HTTP client used for every request. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` initialises the in-memory/ephemeral database before any test runs. |

## Notes

- **Cross-module placement is deliberate.** Moving this under `src/modules/products/tests/` or `src/modules/locales/tests/` would misrepresent the fact that the behaviour belongs to neither module in isolation.
- **`givenTranslation` hard-codes `source: 'digest'`** for non-fallback rows and omits it for the fallback. If the production API ever validates the `source` field, this helper must be updated in lockstep.
- **Union (not intersection) semantics for search** are explicitly asserted: a product can match via its own `title` column *and* a separate product via its translation row in the same result set.
- Uses `.toSorted()` (immutable), implying a modern Node runtime (≥ 20) or a polyfill; not compatible with older test runners.
