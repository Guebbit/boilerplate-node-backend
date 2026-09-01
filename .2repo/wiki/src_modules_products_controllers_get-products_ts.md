# src/modules/products/controllers/get-products.ts

## Purpose

Builds the validation schema and cache-key parameter list for the products list/search endpoints, then hands both to the shared `createSearchController` factory to produce the single controller that serves `GET /products` and `POST /products/search`.

## Key elements

- **`searchProductsQuerySchema`** (module-local) — Zod schema that extends the orval-generated `SearchProductsBody` with type coercion for query-string inputs: `page`/`pageSize` via shared schemas, `minPrice`/`maxPrice` via `z.coerce.number()` (empty string → `undefined`), and `active` via a string-to-boolean preprocess.
- **`searchProductsKeyParameters`** (exported) — `Object.keys(schema.shape)`; the exact set of query parameters that affect the response and therefore must appear in the cache key. Derived from the schema so the two can't drift.
- **`getProducts`** (exported) — The controller instance returned by `createSearchController`. Accepts a coerced `extendInput` (picks first element of `category`/`tag` arrays) and a `runSearch` callback that delegates to `productService.searchViewed` with the caller's scope and context.

## Relationships

- **`src/infrastructure/surfaces/create-search-controller.ts`** — Provides the `createSearchController` factory that `getProducts` is built with; the factory handles HTTP plumbing, validation, and caching.
- **`src/infrastructure/http/schemas.ts`** — Supplies `pageSchema` and `pageSizeSchema` so this endpoint shares pagination rules with other search endpoints.
- **`src/infrastructure/http/request.ts`** — Supplies `callerContextOf(request)` passed into `productService.searchViewed` at call time.
- **`src/modules/products/service.ts`** — Supplies `productService`, whose `searchViewed` and `callerScope` methods are the actual data-access calls.
- **`src/modules/products/routes.ts`** — Upstream consumer; imports `getProducts` to attach it to the route table.

## Notes

- GET query params arrive as strings; the schema's `preprocess`/`coerce` steps handle conversion. Empty strings for `minPrice`/`maxPrice` are intentionally mapped to `undefined` (absent), not `0`, so the service treats them as "no filter."
- `category` and `tag` are single-value in the OpenAPI contract, but clients may send arrays or CSV; `extendInput` silently picks the first element rather than rejecting.
- `searchProductsKeyParameters` is derived from the schema shape, not hand-maintained. Adding a new field to the schema automatically extends the cache key.
- Admin callers see inactive/deleted products; public callers see only active ones. This distinction is resolved inside `productService.searchViewed` via `callerScope`, not in this controller.
