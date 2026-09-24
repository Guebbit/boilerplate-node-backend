---
source: src/modules/products/controllers/get-products.ts
sha256: d74dd4428a78e1e701f4f4739847c0daecf3e80ad9a9554b667f9f25fcf2be8d
generated_at: 2026-09-23T19:26:13.708379+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/controllers/get-products.ts

## Purpose

Builds the shared query schema and cache-key parameters for the product catalogue, then hands both to the `createSearchController` factory so that `GET /products` and `POST /products/search` validate against identical rules and share one cached response.

## Key elements

- **`searchProductsQuerySchema`** — Extends the orval-generated `SearchProductsBody` with `page`/`pageSize` (shared schemas), `z.coerce.number` for `minPrice`/`maxPrice` (since GET carries them as query text), and `optionalBooleanSchema` for `active`. Uses `blankToUndefined` preprocess so empty query strings become `undefined` rather than `NaN`.
- **`searchProductsKeyParameters`** — `Object.keys(schema.shape)`, exported so the cache key is always in sync with what the controller actually reads.
- **`getProducts`** — The exported controller (via `createSearchController`). Accepts `entity: 'products'`, the schema above, an `extendInput` that collapses `category`/`tag` arrays to their first element, and a `runSearch` that delegates to `productService.searchViewed` with a caller scope and caller context.

## Relationships

- **`@infrastructure/surfaces/create-search-controller`** — Factory that wires schema, `extendInput`, and `runSearch` into both the GET and POST handlers, including cache-key assembly.
- **`@modules/products/service`** — `productService.searchViewed` performs the actual query; `productService.callerScope(request.authContext)` decides admin-vs-public visibility.
- **`@infrastructure/http/request`** — `callerContextOf(request)` extracts the downstream call context passed into the service.
- **`@infrastructure/http/schemas`** — Provides `pageSchema`, `pageSizeSchema`, `optionalBooleanSchema`, and `blankToUndefined` so all search endpoints agree on pagination and type-coercion semantics.
- **`@modules/products/routes`** — Maps `GET /products` and `POST /products/search` to the `getProducts` export.

## Notes

- The schema extends an **orval-generated** `SearchProductsBody`; hand-editing the generated file will be overwritten. The only additions here are the GET-specific coercions and the shared pagination fields.
- `category` and `tag` are modelled as single-value in OpenAPI. If a client sends an array or CSV, `coerceStringArray(...)[0]` silently drops everything after the first element.
- `searchProductsKeyParameters` is intentionally derived from the schema shape — do **not** hard-code the parameter list; a new field added to the schema automatically enters the cache key.
- Default pagination values are owned by `normalizePagination` (downstream in the factory/service), not by this file. The schema marks `page`/`pageSize` as optional.
