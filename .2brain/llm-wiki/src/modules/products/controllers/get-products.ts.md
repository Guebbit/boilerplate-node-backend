---
source: src/modules/products/controllers/get-products.ts
sha256: 8dcb953c6ea103cf573a7148852c959687f15218b976a180e361da019e06e6e4
generated_at: 2026-09-27T15:31:12.074459+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/controllers/get-products.ts

## Purpose

Defines the list/search controller for the products catalogue. It builds a Zod query-validation schema (shared by `GET /products` and `POST /products/search`), derives the cache-key parameter list from that schema, and wires both routes onto the shared `createSearchController` factory.

## Key elements

- **`searchProductsQuerySchema`** – Extends the orval-generated `SearchProductsBody` (kept in sync with `openapi.yaml`) with string-to-number coercion for `page`, `pageSize`, `minPrice`, `maxPrice` and text-to-boolean parsing for `active`/`deleted`. Shared `pageSchema`/`pageSizeSchema` ensure consistency across all four search endpoints.
- **`searchProductsKeyParameters`** – Exported array of parameter names, derived via `Object.keys(schema.shape)`. Serves as the set of query params that must appear in the cache key so two differing requests can't collide on one cached response.
- **`getProducts`** – The exported controller (a `createSearchController` instance). Configures entity name, schema, an `extendInput` step, and a `runSearch` callback that delegates to `productService.searchViewed`.

## Relationships

- **`src/modules/products/service.ts`** – Calls `productService.searchViewed(parsed, scope, ctx)` and `productService.callerScope(authContext)` inside the `runSearch` callback.
- **`src/infrastructure/http/request.ts`** – Imports `callerContextOf` to extract per-request caller context passed into the service.
- **`src/infrastructure/http/schemas.ts`** – Imports shared helpers: `blankToUndefined`, `optionalBooleanSchema`, `pageSchema`, `pageSizeSchema`.
- **`src/infrastructure/surfaces/create-search-controller.ts`** – The factory that wraps schema validation, caching, and HTTP dispatch; `getProducts` is a configured instance of it.
- **`src/modules/products/routes.ts`** – Registers `getProducts` as the handler for `GET /products` and `POST /products/search`.

## Notes

- `category` and `tag` may arrive as arrays or CSV strings; `extendInput` coerces them to a single value via `coerceStringArray(...)[0]` because the OpenAPI spec models them as single-value filters.
- The schema extends an **orval-generated** type (`@api/schemas.zod`). Regenerating that client can overwrite local edits—keep custom logic in the `.extend()` block only.
- Visibility (admin sees inactive/deleted, public sees active only) is decided inside `productService.callerScope` based on `request.authContext`; the controller itself does no role checks.
