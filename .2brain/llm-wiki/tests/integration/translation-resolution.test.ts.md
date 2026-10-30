---
source: tests/integration/translation-resolution.test.ts
sha256: 5fc3be15d9337e6dbb1d3b118f124f62a9584b242200c85aae5d617fa2ed8fbe
generated_at: 2026-10-29T07:04:28.175218+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/translation-resolution.test.ts

## Purpose

Integration tests that verify the product read path resolves titles (and search terms) in the caller's negotiated language, including fallback behavior, region-tag normalization, batched page translation, and locale-aware free-text search. The file lives at the top-level `tests/integration/` directory (not under either module) because it crosses the `products` read path and the `locales` data domain.

## Key elements

- **`givenTranslation(productId, locale, title)`** — local helper that calls `translationRepository.upsertEntityLocale` to insert a `product` entity-locale row. Passes `'digest'` as the strategy for non-fallback locales.
- **`FALLBACK`** (`'en'`) — the locale treated as the default/source; its rows are written with `undefined` strategy.
- **`describe('GET /products/:id resolves to the caller's language')`** — single-product lookups: correct locale match, fallback to source title when no translation row exists, and region-tag (`it-CH` → `it`) resolution.
- **`describe('GET /products resolves a whole page in one batched query')`** — list endpoint: all items on a page translated in one pass; mixed translated/untranslated items coexist without blanking.
- **`describe('free-text search follows the caller's locale')`** — `?text=` and `?title=` filters match against the negotiated locale's translation *or* the source column (union, not intersection), and do not produce false positives.

## Relationships

- **`src/modules/locales/repository.ts`** — calls `translationRepository.upsertEntityLocale` to seed translation rows.
- **`src/modules/locales/tests/factories.ts`** — calls `givenLocale` to register a locale in the test DB.
- **`src/modules/products/tests/factories.ts`** — calls `createProduct` to create fixture products.
- **`tests/support/contract.ts`** — imported for side effects (test contract/assertions setup).
- **`tests/support/http.ts`** — provides the `api()` helper for making HTTP requests in tests.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises a clean test database before the suite runs.

## Notes

- The file is intentionally **not** placed under `src/modules/products/tests/` or `src/modules/locales/tests/` — the header comment explains it is cross-module by nature.
- `FALLBACK` is assumed to be `'en'` in every environment; the comment points to `.env-example` as the source of truth.
- Search tests assert **union** semantics (source-column match *and* translation match both return), not intersection — a product whose source title happens to match the search term is returned even without a translation row.
- The `givenTranslation` helper always uses entity type `'product'` and field `{ title }`; it is not a general-purpose helper.
