---
source: tests/integration/translation-resolution.test.ts
sha256: 5757b3080e116b00c803ba4a561ca5cc9c3c40c8e9ebfe247aafa4283c428e91
generated_at: 2026-09-23T20:08:13.560198+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/translation-resolution.test.ts

## Purpose

Integration test that verifies the read-side of the translation system: product titles are resolved to the caller's negotiated `Accept-Language`, untranslated items fall back to the source title (never blank), region tags resolve to their base language, a full page of products is translated in a single batched query, and free-text search unions across both the product's own columns and its translation rows. Placed at the top-level `tests/integration/` (not under either module's `tests/`) because it exercises the cross-module path between `products` and `locales`.

## Key elements

- **`FALLBACK`** (`'en'`) — the fallback locale assumed in every test environment; used to decide whether a translation row needs a `source` annotation.
- **`givenLocale(tag)`** — creates a locale row via `localeRepository.create(makeLocale(…))`.
- **`givenTranslation(productId, locale, title)`** — upserts an entity-locale translation row; passes `'digest'` as source for non-fallback locales, `undefined` for the fallback.
- **`describe('GET /products/:id …')`** — three tests: Italian title returned, source-title fallback when no translation exists, region tag `it-CH` resolving to base `it`.
- **`describe('GET /products … one batched query')`** — two tests: all items on a page translated, and a mixed page (translated + untranslated) returning both titles without blanking.
- **`describe('free-text search …')`** — five tests covering: search matching a translation word absent from the source column, search still reaching the source column when no translation exists, union (not intersection) of own-column and translation matches, non-matching products excluded, and the `title=` filter behaving the same way as `text=`.

## Relationships

- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module load to initialise a clean test database.
- **`tests/support/http.ts`** — provides the `api()` test HTTP client used in every request.
- **`tests/support/contract.ts`** — side-effect import that registers `toSatisfyApiSpec` for API-contract assertions on responses.
- **`src/modules/locales/factories.ts`** — `makeLocale` builds locale fixtures inside `givenLocale`.
- **`src/modules/locales/repository.ts`** — `localeRepository` and `translationRepository` are the two repositories the helpers write through.
- **`src/modules/products/tests/factories.ts`** — `createProduct` creates the product rows that the tests then translate or query.

## Notes

- The file is intentionally **not** nested under `src/modules/…/tests/` — the header comment explains this is cross-module by design.
- `en` as fallback is an environment assumption (see `.env-example`); if the test environment changes its fallback locale, the `FALLBACK` constant and the `source`-annotation logic in `givenTranslation` must be updated together.
- Search semantics under test are **union**: a product can appear if it matches on its own column _or_ on its translation row, not both. The "unions rather than intersects" test exists specifically to guard against an implementation that accidentally intersects.
- Every assertion that checks a resolved response also calls `.toSatisfyApiSpec()` (except the two fallback/no-translation tests), tying correctness to the OpenAPI contract.
