---
source: src/modules/products/controllers/get-products.ts
sha256: 7f03f34b13e9146fca1a023768e6b286fbc6ef1252270c21d15fae33e92885ce
generated_at: 2026-10-15T11:40:51.831199+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/controllers/get-products.ts

## Purpose

List/search controller for the product catalogue. It builds a single Zod query schema shared by `GET /products` and `POST /products/search`, derives the response-cache key from that schema's keys, and hands both routes to the shared `createSearchController` factory.

## Key elements

- **`searchProductsQuerySchema`** – Extends the orval-generated `SearchProductsBody` with `z.coerce.number()` for price fields and `optionalBooleanSchema` for flag fields, so GET query-string text is normalised to the same types the POST body already carries.
- **`searchProductsKeyParameters`** (exported) – `Object.keys` of the schema shape; the param list the cache key uses. Derived from the schema so it can't drift from what the controller actually reads.
- **`extendSearchInput`** – Picks the first element of `category`/`tag` arrays (OpenAPI models them as single-value). Applied identically to the controller and the cache key.
- **`searchProductsKeyValues`** (exported) – Runs `mergedSearchInput` + `safeParse` against the request and returns the validated object (or `undefined` on failure) so the response cache can use a canonical key.
- **`searchProductsOrderedParameters`** (exported) – `['sort']`; the only array param whose element order is semantically significant (others, e.g. `id`, are sorted before keying).
- **`getProducts`** (exported) – The controller produced by `createSearchController`. Delegates the actual query to `productService.searchForCaller`, passing caller scope and context.

## Relationships

- **`@infrastructure/http/request`** – Imports `callerContextOf` to build the context object passed into `productService.searchForCaller`.
- **`@infrastructure/http/schemas`** – Imports shared schema fragments (`pageSchema`, `pageSizeSchema`, `optionalBooleanSchema`, `blankToUndefined`) so this endpoint's pagination and boolean handling match the other search endpoints.
- **`@infrastructure/surfaces/create-search-controller`** – Imports `createSearchController` (the factory that wires both HTTP verbs) and `mergedSearchInput` (used inside `searchProductsKeyValues` to merge query + body before parsing).
- **`src/modules/products/services/index.ts`** – Imports `productService`; calls `productService.searchForCaller` and `productService.callerScope` to perform the query and determine admin vs. public visibility.
- **`src/modules/products/routes.ts`** – Registers `getProducts` on the router for the catalogue module.

## Notes

- The base fields of the schema come from `@api/schemas.zod` (orval-generated from `openapi.yaml`); only the type-coercion layer is hand-written here. Don't duplicate field definitions.
- `category` and `tag` accept arrays in the schema but are reduced to a single value by `extendSearchInput`. Both the controller path and the cache-key path call this helper, so they always see the same value.
- Cache-key correctness depends on `searchProductsKeyParameters` staying in lock-step with the schema. Because it's derived via `Object.keys(shape)`, adding a field to the schema automatically includes it in the key—no manual list to update.
- Visibility (admin sees inactive/deleted; public does not) is resolved inside `productService.callerScope`, not in this controller. The controller is agnostic to auth level.
