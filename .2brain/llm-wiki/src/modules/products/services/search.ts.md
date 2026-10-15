---
source: src/modules/products/services/search.ts
sha256: 91a14bacca3cbc1a26d3eddd231dc2d6dea521faa9e4b4de002ab1e1304f3249
generated_at: 2026-10-15T11:45:35.820625+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/services/search.ts

## Purpose

Service-layer glue for catalogue product search. It orchestrates locale-aware free-text matching (union of a product's own column with its translation rows), overlays the caller's language onto results, applies stock-visibility redaction per caller role, and exposes facet counts. Controllers call into this module rather than the repository directly, keeping the layer boundary intact.

## Key elements

- **`search(filters, scope?)`** — Core exported search. Builds a search pattern, delegates to `productRepository.search` (or the translated-union path when `text`/`title` is present), then batch-applies `applyTranslations('product', items)` so every returned product carries the caller's locale strings. Returns `{ items: Product[], meta: PaginatedMeta }`.
- **`searchWithTranslatedText(filters, scope, pattern)`** — Private helper. Unions the product's own `buildWhere({text, title})` match with `searchTranslatedEntityIds` results for the caller's locale chain. Strips `text`/`title` from the remaining filters to avoid a redundant AND. Merges the union with the caller scope via `withScope`.
- **`searchForCaller(filters, scope, context)`** — Public wrapper around `search` that calls `canSeeStock` / `redactStock` on each item based on `context.caller`. Intended for endpoints that carry an authenticated caller; keeps the base `search` usable by tests and `facets` without a `CallerContext`.
- **`facets()`** — Thin pass-through to `productRepository.facets()`. Returns `{ categories: FacetCount[], tags: FacetCount[] }`. Exists so controllers never reach past the service layer.
- **`TRANSLATABLE_SEARCH_FIELDS`** — `['title', 'description'] as const`. The columns participating in translated search; must stay in sync with `repository.ts`'s `searchable.text` and the `translatables` registration in `products/module.ts`.

## Relationships

- **`src/infrastructure/i18n/index.ts`** — Provides `getCurrentLocale` and `localeCandidatesFor`, used to resolve the caller's locale chain for translated matching.
- **`src/kernel/translation.ts`** — Provides `applyTranslations` (batch-overlay of locale strings onto results) and `searchTranslatedEntityIds` (query the translations collection for matching entity IDs).
- **`src/modules/products/repository.ts`** — Provides `productRepository` whose `search`, `buildWhere`, and `facets` methods are the data-access primitives this service composes.
- **`src/infrastructure/persistence/search.ts`** — Provides the `toSearchPattern` helper and the `PaginatedMeta` type.
- **`src/infrastructure/persistence/create-repository.ts`** — Provides `toObjectId` (string → ObjectId for the `$in` clause) and `withScope` (safe merge of a `$or`-bearing filter with the caller scope).
- **`src/modules/products/services/stock-view.ts`** — Provides `canSeeStock` and `redactStock`, used by `searchForCaller` to gate stock counters per caller role.
- **`src/types/index.ts`** — Source of the `SearchProductsRequest`, `Product`, `FacetCount`, and `CallerContext` types consumed here.

## Notes

- `TRANSLATABLE_SEARCH_FIELDS` is deliberately hardcoded rather than read from the translation registry. It must be kept in sync manually with `repository.ts`'s `searchable.text` declaration and the `translatables` registration in `products/module.ts`. Drift between the three silently breaks translated search.
- The union in `searchWithTranslatedText` uses `withScope(union, scope)` rather than object spread because both the `$or` union and the incoming scope can themselves contain `$or` keys; a spread would clobber one.
- `searchForCaller` wraps `search` instead of folding the stock logic in, so that callers without a `CallerContext` (unit tests, the `facets` path, internal jobs) can call `search` directly.
- `applyTranslations` issues a single batched query for the whole page, not one per item; it is a no-op when no translations are registered or no row matches.
- Search events are intentionally **not** reported from this module; the response cache means most reads are repeat hits, so analytics reporting is delegated to the browser-side analytics module.
