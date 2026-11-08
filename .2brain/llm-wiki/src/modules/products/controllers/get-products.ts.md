---
source: src/modules/products/controllers/get-products.ts
sha256: 79761778330dfb053b6e4c6f2f5c3bf17b43d0abff673f62afa913a86d137769
generated_at: 2026-11-08T07:42:40.447751+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/controllers/get-products.ts

## Purpose

Builds the query schema, cache-key derivation, and search handler for the two catalogue endpoints (`GET /products` and `POST /products/search`), then hands them to the shared `createSearchController` factory so both routes share identical validation, caching, and response-shaping logic.

## Key elements

- **`searchProductsQuerySchema`** — Zod schema that extends the orval-generated `SearchProductsBody` with query-string-friendly coercions: `page`/`pageSize` coerced from strings, blank `priceMin`/`priceMax` mapped to `undefined`, and `active`/`purchasable`/`deleted` parsed via `optionalBooleanSchema`.
- **`searchProductsKeyParameters`** (exported) — `Object.keys(schema.shape)`, so the cache-key parameter list is derived from the schema and cannot drift from what the controller actually reads.
- **`extendSearchInput`** — Normalises `category` and `tag` from possible arrays/CSV to a single value (first element) before validation.
- **`searchProductsKeyValues`** (exported) — Runs the same `safeParse` the controller uses (via `mergedSearchInput`) and returns the parsed object for the cache key, or `undefined` when the request would be rejected.
- **`searchProductsOrderedParameters`** (exported) — `['sort']` as const; the only array whose element order is semantically significant (all others, e.g. `id`, are treated as sets and sorted for the key).
- **`getProducts`** (exported) — The final controller produced by `createSearchController({ entity: 'products', schema, extendInput, runSearch })`. The `runSearch` closure delegates to `productService.searchForCaller`, passing the caller's scope and context for role-based filtering.

## Relationships

- **`src/modules/products/services/index.ts`** — Provides `productService`; the controller calls `productService.searchForCaller(parsed, callerScope, callerContext)` to execute the actual query.
- **`src/infrastructure/surfaces/create-search-controller.ts`** — Supplies the `createSearchController` factory (wiring validation, caching, and HTTP response) and `mergedSearchInput` (combines query + body parameters before parsing).
- **`src/infrastructure/http/schemas.ts`** — Source of shared building blocks: `pageSchema`, `pageSizeSchema`, `optionalBooleanSchema`, and the `blankToUndefined` preprocessor.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf(request)`, extracted from the request and forwarded to the service for tenant/caller-aware filtering.
- **`src/modules/products/routes.ts`** — Mounts `getProducts` on the `GET /products` and `POST /products/search` routes.

## Notes

- **Schema is the single source of truth for both validation and caching.** `searchProductsKeyParameters` and `searchProductsKeyValues` are derived from the same schema object the controller validates against, so a parameter the controller reads but the key omits (a stale-cache bug) cannot occur by construction.
- **Defaults are *not* applied here.** The schema intentionally leaves `page`/`pageSize` absent rather than filling defaults; `normalizePagination` (lived in the service or factory) owns that step.
- **`category` / `tag` coercion is shared.** Both the controller and the cache key go through `extendSearchInput`, guaranteeing they agree on which value (first element) is used.
- **Role-based visibility is implicit.** The controller itself does no filtering; it passes `callerScope` and caller context to the service, which decides whether inactive/deleted products are included (admin vs. public).
