---
source: src/modules/products/services/search.ts
generated_at: 2026-11-22T07:13:59.341545+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/services/search.ts

## Purpose
Service-layer catalogue search for products, with the caller's locale unioned into free-text matching, plus the public category/tag facets. It sits between the products controllers and the repository, so controllers never reach past the service layer.

## Key elements
- `search(filters, scope?)`: base search (matches `POST /products/search`). If `text`/`title` yields a search pattern, it delegates to `searchWithTranslatedText`. Otherwise it calls `productRepository.search` directly. The result items then pass through `applyTranslations('product', …)`, one batched query, which does nothing when nothing is registered or no row matches.
- `searchWithTranslatedText` (internal): builds the product's own match with `productRepository.buildWhere({ text, title })`. It then asks `searchTranslatedEntityIds` for products whose translated `title`/`description` match in the caller's locale chain, using `localeCandidatesFor(getCurrentLocale())` and `previewDraftTag()`. The final where clause is `$or: [ownMatch, { _id: { $in: translatedIds } }]`, or just `ownMatch` if no translated ids were found. It is combined with the scope via `withScope` and passed to `productRepository.search`.
- `TRANSLATABLE_SEARCH_FIELDS`: `['title', 'description']`, the fields searched in translations. It is hardcoded here, not read from the translation registry.
- `searchForCaller(filters, scope, context)`: wraps `search` and adds per-row `actions` through `standingOnRead(callerScope, context.caller)` and `withActions`. For a caller answered from the shared cache, these `actions` are all `false`.
- `facets()`: a pass-through to `productRepository.facets()`, returning the public categories and tags with counts.

## Relationships
- **`src/modules/products/repository.ts`**: `productRepository.search`, `buildWhere` and `facets` do the actual querying and scoping.
- **`src/kernel/translation.ts`**: provides `applyTranslations`, `searchTranslatedEntityIds` and `previewDraftTag`.
- **`src/infrastructure/i18n/`** (`catalog.ts`, `context.ts`, `index.ts`): `getCurrentLocale` and `localeCandidatesFor` are imported from the i18n index and determine the locale chain.
- **`src/infrastructure/persistence/search.ts`**: `toSearchPattern` and the `PaginatedMeta` type.
- **`src/infrastructure/persistence/create-repository.ts`**: `toObjectId` and `withScope`.
- **`src/modules/products/services/actions.ts`**: `standingOnRead` and `withActions`, used by `searchForCaller`.
- **`src/modules/products/services/read.ts`**: `callerScope`, used by `searchForCaller`.
- **`src/types/index.ts`** and **`src/types/auth-context.ts`**: `SearchProductsRequest`, `Product`, `FacetCount` and `CallerContext`.
- **Consumers**: the neighbors `src/modules/products/services/index.ts`, `src/modules/products/controllers/get-catalog-facets.ts` and `src/modules/shop-tasks/tests/integration/tasks.test.ts` are linked to this file in the graph. This file's content does not show how they use it.

## Notes
- **Union semantics**: a product matches if its own column matches or a translation in the caller's locale chain matches. A product with no translation row is still found through its own column.
- **Stripping `text`/`title`**: `searchWithTranslatedText` removes them from the filters before the second `buildWhere`. This avoids ANDing in a redundant match, since `$or` already carries the own-match.
- **`withScope`, not a spread**: both the union and the scope may carry an `$or`, so merging them with a spread would let one overwrite the other.
- **Why `searchForCaller` is a wrapper**: other callers of `search()`, such as unit tests, have no `CallerContext`. Searches are not reported from here, because the response cache hides most reads. The browser reports them instead (`modules/analytics`).
- **`TRANSLATABLE_SEARCH_FIELDS`**: it must stay in sync with the repository's `searchable.text` and the `translatables` registration in `src/modules/products/module.ts`.
- **`facets()`**: relies on the repository to limit results to active, non-deleted rows.
