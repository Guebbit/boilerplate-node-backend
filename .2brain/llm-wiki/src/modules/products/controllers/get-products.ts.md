---
source: src/modules/products/controllers/get-products.ts
source_sha256: 79761778330dfb053b6e4c6f2f5c3bf17b43d0abff673f62afa913a86d137769
context_sha256: b84b471a2b4aad902603f3d7486bf88b23883c50aef1464c3c0ae538124e9312
generated_at: 2026-11-22T07:08:03.711305+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/controllers/get-products.ts

## Purpose
List/search controller for the product catalogue. It builds the query schema that both `GET /products` and `POST /products/search` validate against, derives the response-cache key inputs from that same schema, and wires everything onto the shared `createSearchController` factory.

## Key elements
- **`searchProductsQuerySchema`** (private): extends the orval-generated `SearchProductsBody` (kept in sync with `openapi.yaml`). It takes `page`/`pageSize` from the shared schemas, turns blank `priceMin`/`priceMax` into absent, and parses `active`, `purchasable` and `deleted` as optional booleans (query strings carry them as text).
- **`searchProductsKeyParameters`**: the keys of the schema shape. These are the parameters that change the answer, and therefore the cache key.
- **`extendSearchInput`** (private): reduces `category` and `tag` to their first value via `coerceStringArray`, because OpenAPI models them as single-value filters. The controller and the cache key both use it.
- **`searchProductsKeyValues(request)`**: merges the request input with `mergedSearchInput`, validates it with the schema and returns the parsed data. It returns `undefined` if validation fails, meaning there is nothing to cache.
- **`searchProductsOrderedParameters`**: `['sort']`. This array's order is meaningful. Other arrays, such as `id`, are treated as sets, and the cache key sorts them.
- **`getProducts`**: the controller, created by `createSearchController` with `entity: 'products'`, the schema and `extendInput`. Its `runSearch` calls `productService.searchForCaller` with the parsed input, `productService.callerScope(request.caller)` and `callerContextOf(request)`.

## Relationships
- `src/infrastructure/http/request.ts`: provides `callerContextOf`, which builds the caller context passed to the service.
- `src/infrastructure/http/schemas.ts`: provides `blankToUndefined`, `optionalBooleanSchema`, `pageSchema` and `pageSizeSchema`, so all search endpoints agree on what is legal.
- `src/infrastructure/surfaces/create-search-controller.ts`: provides `createSearchController`, which builds the controller, and `mergedSearchInput`, which merges the request input.
- `src/modules/products/services/index.ts`: provides `productService`, which executes the search and computes the caller's scope.
- `src/modules/products/routes.ts`: this is a graph neighbour of the file. The content shows no direct reference to it. The route wiring and cache-key configuration presumably import `getProducts` and the `searchProducts*` exports from here.

## Notes
- The cache key is derived from the schema, not hand-listed. This prevents two different requests from sharing one cached response. For the same reason, `priceMin: ""` and an absent `priceMin` produce the same key.
- `page` and `pageSize` defaults are not set here. They stay absent, and `normalizePagination` owns the defaults.
- Visibility depends on the caller. Admins see all products, including inactive and deleted ones. The public sees only active ones. This is enforced through `productService.callerScope`.
- Prices stay as decimal text.
