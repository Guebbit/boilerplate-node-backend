---
source: src/modules/products/services/search.ts
sha256: 067933f350987b6e48182954bbcc9630936fc6c26f1416a99d56f542c07805dd
generated_at: 2026-11-14T21:29:23.000486+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/services/search.ts

## Purpose

Service-layer entry point for product catalogue search. It composes a locale-aware free-text query (unioning the product's own columns with matches in the translations collection), applies caller-scoped stock redaction and per-row action flags, and exposes public facets. Exists so that controllers and the analytics/layering rules never reach directly into `productRepository` or the persistence helpers.

## Key elements

- **`search(filters, scope?)`** – Base search. Builds a search pattern from `text`/`title`; if a pattern exists, delegates to `searchWithTranslatedText` to union own-column + translated-entity matches; otherwise calls `productRepository.search` directly. Post-processes every page through `applyTranslations('product', …)` (one batched query) before returning `{ items, meta }`.
- **`searchForCaller(filters, scope?, context)`** – Wraps `search` and overlays caller-specific concerns: `redactStock` (gated by `canSeeStock`) and `withActions` (gated by `standingOnRead`). Intended for `GET /products` / `POST /products/search` HTTP paths.
- **`facets()`** – Pass-through to `productRepository.facets()`; returns `{ categories: FacetCount[], tags: FacetCount[] }` for the public catalogue.
- **`TRANSLATABLE_SEARCH_FIELDS`** – `['title', 'description']` as-const; the fields a translated text search targets. Mirrors what `module.ts` registers in the translation registry.
- **`searchWithTranslatedText(filters, scope, pattern)`** – (internal) Strips `text`/`title` from the remaining filters, builds the "own match" via `productRepository.buildWhere`, calls `searchTranslatedEntityIds` for the caller's locale chain, then unions both conditions with `$or` and passes through `withScope` before the final repository search.

## Relationships

- **`src/infrastructure/i18n/catalog.ts`**, **`src/infrastructure/i18n/context.ts`**, **`src/infrastructure/i18n/index.ts`** – Provides `getCurrentLocale()` and `localeCandidatesFor()` to build the caller's locale chain for the translated-search query.
- **`src/kernel/translation.ts`** – `applyTranslations` localises already-fetched rows; `searchTranslatedEntityIds` runs the cross-collection text match; `previewDraftTag` flags draft rows during preview.
- **`src/types/index.ts`**, **`src/types/auth-context.ts`** – Type contracts: `SearchProductsRequest`, `Product`, `FacetCount`, `CallerContext`.
- **`src/infrastructure/persistence/search.ts`** – `toSearchPattern` normalises the free-text input; `PaginatedMeta` is the pagination shape returned on every search.
- **`src/infrastructure/persistence/create-repository.ts`** – `toObjectId` converts string ids for `$in` clauses; `withScope` safely merges two conditions that may each contain `$or`.
- **`src/modules/products/repository.ts`** – `productRepository.search`, `buildWhere`, and `facets` are the persistence calls this module delegates to.
- **`src/modules/products/services/stock-view.ts`** – `canSeeStock` and `redactStock` decide whether the caller sees real inventory numbers.
- **`src/modules/products/services/actions.ts`** – `standingOnRead` resolves the caller's permission standing; `withActions` stamps each product's `actions` array.
- **`src/modules/products/services/read.ts`** – Exports `callerScope`, the row-level visibility filter passed into every search.
- **`src/modules/products/services/index.ts`** – Barrel re-export so other modules can import `search`, `searchForCaller`, `facets` from the services barrel.
- **`src/modules/products/controllers/get-catalog-facets.ts`** – Consumes `facets()`.

## Notes

- `TRANSLATABLE_SEARCH_FIELDS` is a **local constant**, deliberately not read from the translation registry. It must be kept in sync manually with `src/modules/products/module.ts`; a mismatch means the translated search silently misses a field.
- `searchForCaller` wraps `search` rather than folding caller logic into it, so unit tests and other internal callers can invoke `search` without a `CallerContext`.
- Search events are **not** emitted for analytics here; the response cache absorbs most reads and the browser (`modules/analytics`) is the reporting layer.
- In `searchWithTranslatedText`, `text`/`title` are destructured out before the second `buildWhere` call to prevent a redundant AND on the same columns.
- `withScope` is used instead of object spread because both the union condition and the caller scope may independently contain `$or`; spreading would flatten the second `$or` into the first.
