---
source: src/modules/products/controllers/get-products.ts
sha256: bebc15f4a861faba5fc963aa11813f4aca7ea275a10508f3b0529ff52afe4e6c
generated_at: 2026-10-29T05:25:10.083710+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/controllers/get-products.ts

## Purpose

Builds the shared Zod validation schema, cache-key helpers, and the final Express handler for both `GET /products` and `POST /products/search`. The controller is produced entirely by the `createSearchController` factory; this file's job is to supply the schema, input normalisation, and the service call.

## Key elements

- **`searchProductsQuerySchema`** – Extends the orval-generated `SearchProductsBody` with `pageSchema`/`pageSizeSchema` (from shared infra schemas) and coerces `priceMin`, `priceMax`, `active`, `purchasable`, `deleted` from raw query-string text to their typed forms.
- **`searchProductsKeyParameters`** – Exported array of parameter names derived from the schema's shape; consumed by the caching layer to build a cache key that always covers every field the controller reads.
- **`extendSearchInput`** – Normalises `category` and `tag` (which may arrive as arrays or CSV strings) to their first element, matching the single-value OpenAPI contract. Shared between validation and cache-key generation.
- **`searchProductsKeyValues`** – Exports a function that runs `mergedSearchInput` through the same schema and returns the parsed object (or `undefined` on failure) for use as the cache key value.
- **`searchProductsOrderedParameters`** – Declares `['sort']` as the sole order-sensitive array parameter; all other arrays (e.g. `id`) are treated as sets and sorted in the key.
- **`getProducts`** – The exported controller. Calls `productService.searchForCaller` with the parsed input, a caller scope, and a caller context. Handles both public (active-only) and admin (all products) visibility via the service layer.

## Relationships

- **`src/infrastructure/surfaces/create-search-controller.ts`** – Provides the `createSearchController` factory and `mergedSearchInput` helper that this file wires the schema and service call into.
- **`src/infrastructure/http/schemas.ts`** – Supplies `pageSchema`, `pageSizeSchema`, `optionalBooleanSchema`, and `blankToUndefined`, keeping pagination and boolean coercion consistent across all search endpoints.
- **`src/infrastructure/http/request.ts`** – Provides `callerContextOf` to extract the authenticated caller's context for the service call.
- **`src/modules/products/services/index.ts`** – Exports `productService`, whose `searchForCaller` and `callerScope` methods perform the actual catalogue query and role-based filtering.
- **`src/modules/products/routes.ts`** – Registers `getProducts` (and the search variant) against the Express router for `GET /products` and `POST /products/search`.

## Notes

- The schema intentionally extends the orval-generated `SearchProductsBody` rather than redefining fields, so OpenAPI and runtime validation stay in sync. Any new query parameter must be added to the schema *and* will automatically appear in `searchProductsKeyParameters`.
- `blankToUndefined` is used as a `z.preprocess` step so an empty query-string value (`?priceMin=`) is treated as "not provided" instead of failing `z.coerce.number()`.
- Array parameters are order-insensitive for caching (sorted in the key) **except** `sort`, whose token order changes the result. Adding a new order-sensitive array to the schema requires also appending it to `searchProductsOrderedParameters`.
- Admin vs. public visibility is not enforced in this controller; it delegates entirely to `productService.callerScope`, so the controller itself is role-agnostic.
