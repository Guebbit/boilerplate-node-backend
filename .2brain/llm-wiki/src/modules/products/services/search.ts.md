---
source: src/modules/products/services/search.ts
sha256: c97bfbb588d382e14800422c0d2cbec86be23216f65e3c89176a73aa8d915c59
generated_at: 2026-11-08T07:48:27.473447+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/services/search.ts

## Purpose

Service-layer entry point for catalog product search. It adds locale-aware free-text matching (unioning the product's own columns with its translation rows) and caller-scoped stock redaction on top of the raw repository query, then exposes a thin `facets` pass-through for the public catalog.

## Key elements

- **`search(filters?, scope?)`** – Public search. Builds a text pattern, routes through `searchWithTranslatedText` when a free-text term is present, otherwise calls `productRepository.search` directly. Post-processes the page with `applyTranslations('product', …)` (one batched query, not per-item).
- **`searchWithTranslatedText(filters, scope, pattern)`** *(private)* – Strips `text`/`title` from the filters, builds the "own column" match via `productRepository.buildWhere`, then unions it with IDs returned by `searchTranslatedEntityIds` (locale-chain candidates + draft tag). The union is passed through `withScope` before the final repository call.
- **`searchForCaller(filters, scope, context)`** – Wraps `search` and maps each item through `redactStock(product, canSeeStock(context.caller))`. Intended for controllers that carry a `CallerContext`; other callers (tests) use `search` directly.
- **`facets()`** – One-line pass-through to `productRepository.facets()`. Kept at the service tier so controllers never reach the repository directly (layering rule).
- **`TRANSLATABLE_SEARCH_FIELDS`** – `['title', 'description'] as const`. Mirrors the `searchable.text` declaration in `repository.ts` and the `translatables` registration in `module.ts`; kept local to avoid a registry read.

## Relationships

- **`src/infrastructure/i18n/`** (`catalog.ts`, `context.ts`, `index.ts`) – Imports `getCurrentLocale` and `localeCandidatesFor` to resolve the caller's locale chain for the translated-ID lookup.
- **`src/kernel/translation.ts`** – Imports `applyTranslations` (batch-apply locale rows onto a page), `searchTranslatedEntityIds` (query the translations collection), and `previewDraftTag` (include/exclude draft rows).
- **`src/infrastructure/persistence/search.ts`** – Imports `toSearchPattern` (normalises user input into a regex-friendly pattern) and the `PaginatedMeta` type.
- **`src/infrastructure/persistence/create-repository.ts`** – Imports `toObjectId` (string → BSON ObjectId for the `$in` clause) and `withScope` (safe merge of two possibly-`$or`-bearing filter objects).
- **`src/modules/products/repository.ts`** – Imports `productRepository` for `search`, `buildWhere`, and `facets`.
- **`src/modules/products/services/stock-view.ts`** – Imports `canSeeStock` and `redactStock` for the `searchForCaller` visibility layer.
- **`src/modules/products/services/index.ts`** – Re-exports the three public functions (`search`, `searchForCaller`, `facets`).
- **`src/modules/products/controllers/get-catalog-facets.ts`** – Consumes `facets()` to serve the public facet list.
- **`src/types/`** (`auth-context.ts`, `index.ts`) – Imports `SearchProductsRequest`, `Product`, `FacetCount`, `CallerContext`.

## Notes

- **`withScope`, not spread:** Both the union filter and the caller scope can independently contain `$or`; a naïve `{ ...union, ...scope }` would clobber one. `withScope` merges them safely.
- **Strip before `buildWhere`:** `text`/`title` are destructured out before the second `buildWhere` call inside `searchWithTranslatedText` to avoid AND-ing a redundant second text predicate.
- **`searchForCaller` wraps, not folds:** `search` remains callable without a `CallerContext` (unit tests, internal tooling). The stock-redaction step is applied only in the wrapper.
- **No analytics tracking here:** Search events are reported client-side (browser) because the response cache makes most reads invisible to the server.
- **`applyTranslations` is a no-op when** nothing is registered for `'product'` or no translation row matches the locale chain, so it is safe to call unconditionally in `search`.
