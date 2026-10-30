---
source: src/modules/products/services/search.ts
sha256: 93babe221327bc06d70bfed7c68fe225fec8a4fdeafb819e908d2ed0f2bf7d52
generated_at: 2026-10-29T05:30:01.084146+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/services/search.ts

## Purpose

Catalogue search service for products. Handles locale-aware free-text search (unioning the product's own columns with its translated rows in the caller's locale chain), wraps results with stock redaction for authenticated callers, and exposes public facet counts.

## Key elements

- **`TRANSLATABLE_SEARCH_FIELDS`** — `['title', 'description']`; the pair of fields matched in both the product collection and the translations collection. Kept local rather than read from the registry.
- **`search(filters?, scope?)`** — Main search entry point. Builds a search pattern, delegates to `searchWithTranslatedText` when a free-text term is present, otherwise calls `productRepository.search` directly. Overlays `applyTranslations` on the resulting page (one batched query, no-op when no translations exist).
- **`searchWithTranslatedText(filters, scope, pattern)`** — (internal) Implements the OR-union: the product's own `buildWhere` match **or** IDs returned by `searchTranslatedEntityIds` across the caller's locale candidates. Strips `text`/`title` from the filter before the second repository call to avoid a redundant AND.
- **`searchForCaller(filters, scope, context)`** — Wraps `search()` and maps each item through `redactStock` based on `canSeeStock(context.caller)`. Intended for `GET /products` / `POST /products/search` controllers.
- **`facets()`** — Pass-through to `productRepository.facets()`; returns public category and tag counts.

## Relationships

- **`@infrastructure/i18n`** (`catalog.ts`, `context.ts`, `index.ts`) — provides `getCurrentLocale` and `localeCandidatesFor` for building the locale chain.
- **`@kernel/translation.ts`** — provides `applyTranslations` (overlay locale on results), `previewDraftTag` (filter out drafts), and `searchTranslatedEntityIds` (query the translations collection).
- **`@infrastructure/persistence/search.ts`** — provides `toSearchPattern` (normalize the free-text term) and the `PaginatedMeta` return type.
- **`@infrastructure/persistence/create-repository.ts`** — provides `toObjectId` (string → ObjectId for the `$in` clause) and `withScope` (merge a caller scope alongside a `$or` filter without clobbering it).
- **`../repository.ts`** — `productRepository` supplies `search`, `buildWhere`, and `facets`.
- **`./stock-view.ts`** — `canSeeStock` and `redactStock` gate stock counters on the caller's `read:StockLevel` permission.
- **`@types`** (`auth-context.ts`, `index.ts`) — `SearchProductsRequest`, `Product`, `FacetCount`, `CallerContext` type definitions.
- **`../services/index.ts`** — barrel re-export of this module.
- **`controllers/get-catalogue-facets.ts`** — consumes `facets()`.

## Notes

- `searchForCaller` **wraps** `search()` rather than merging stock logic into it, so callers without a `CallerContext` (e.g. unit tests) can call `search()` directly.
- `search` is intentionally **not** an analytics reporting point — the response cache absorbs most reads, so the browser-side analytics module handles reporting.
- `facets()` is a one-line pass-through today, but exists to enforce the layering rule: controllers must not call the repository directly.
- `withScope` is used (not object spread) to combine the `$or` union with a caller scope, since both may contain `$or` and a spread would clobber one.
