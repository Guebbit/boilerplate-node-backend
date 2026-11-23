---
source: src/modules/products/openapi.yaml
generated_at: 2026-11-22T07:11:06.546963+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/openapi.yaml

## Purpose
OpenAPI 3.1 contract for the `products` module (version `0.1.0`). It defines the catalogue's HTTP surface: listing, searching, creating and reading products, and replacing them. It also covers per-operation security, caching behavior and error codes. Shared parameters, responses, headers and schemas are `$ref`'d from `shared/contracts/openapi.root.yaml`.

## Key elements
- **Tag `Products`** (`x-family: Catalogue`) is the single tag all operations file under.
- **`x-error-codes`** at the top level declares `PRODUCT_NOT_DELETED` (409), which is returned when a restore targets a product that is not soft-deleted. Individual operations also carry their own `x-error-codes`, e.g. `createProduct` lists `IDEMPOTENCY_IN_FLIGHT` (409) and `IDEMPOTENCY_KEY_MISMATCH` (422).
- **`GET /products`** (`listProducts`)
  - Paginated and public, and also accepts bearer or API key auth.
  - Uses the shared `PageParam`, `PageSizeParam`, `TextParam` and `IdParam` parameters.
  - Adds a `sort` query (`ProductSort`, JSON:API style `-price,title`, comma-separated, `form`/`explode: false`).
  - Adds filters `category`, `tag`, `priceMin`, `priceMax`, `title`, `active`, `purchasable` and `deleted`.
  - Returns `ProductsResponse`.
- **`POST /products`** (`createProduct`)
  - Requires `create:Product` and `update:Translation`, via bearer or API key.
  - Takes an `Idempotency-Key` header.
  - Accepts `application/json` (`CreateProductRequest`) or `multipart/form-data` (`CreateProductRequestMultipart`).
  - Returns 201 with a `Location` header and a `Product` body.
  - Also documents 401, 403, 409, 422 and 429.
- **`GET /products/facets`** (`getCatalogFacets`)
  - Public, with no security requirement.
  - Returns categories and tags with visible-product counts (`CatalogFacetsResponse`), sorted by count descending and then by name.
  - Counts are catalogue-wide and do not follow the filters already chosen.
- **`/products/{id}`**
  - `GET` (`getProductById`) is public, with optional bearer or API key auth, and returns `Product`.
  - `PUT` ("Replace product") appears in the visible part of the file, where it is described as a full replacement.
- **`components/schemas`** are referenced locally, e.g. `ProductSort`, `ProductsResponse`, `Product`, `CreateProductRequest`, `CreateProductRequestMultipart` and `CatalogFacetsResponse`.

## Relationships
- **`authorization.yaml`** sits beside this file in the module. The `security` blocks here use permission scopes such as `create:Product`, `update:Translation`, `read:Translation` and `display:Locale`, which authorization rules would govern.
- **`openapi.browser-events.yaml`** is a sibling contract for the same module. This file does not reference it in the visible portion.

## Notes
- **Bundler extensions.** `x-versioned` on a path lists the methods that a bundler augments. On `/products` it covers `post`. On `/products/{id}` it covers `get`, `put`, `patch` and `delete`, adding `If-Match`, a 412 response and `ETag`. `x-cache` (`revalidate`, `max-age: 3600`) is a custom caching hint.
- **Shared components.** Parameters, responses (`Unauthorized`, `Forbidden`, `Conflict`, `ValidationError`, `TooManyRequests`, `NotFound`), the `Location` header and the `NonNegativeDecimalAmount` schema come from `shared/contracts/openapi.root.yaml`.
- **Caller-dependent bodies and caching.**
  - On `GET /products`, `Cache-Control` is `public, no-cache` for guest-equivalent callers.
  - It is `private, no-cache` for staff who see more, and `private, no-store` for a draft-language preview.
  - A body that differs by caller is never stored in the shared cache.
  - Per-row `actions` are all `false` for callers answered from the shared cache.
- **Duplicate filters.** `category`, `tag` and the price filters are declared both here as query parameters and in `SearchProductsRequest`. The controller merges query and body, so `GET /products?category=x` and `POST /products/search {category}` are the same filter.
- **Creation rules.**
  - The fallback locale (`NODE_FALLBACK_LOCALE`) must be present and non-null in `translations`.
  - New products start with no stock. Units are added only through `POST /inventory/levels/{productId}/receive`, which needs `create:StockMovement`.
- **Query semantics.**
  - `deleted=true` returns an empty page for callers who cannot see deleted rows.
  - `purchasable` is open to every caller.
- **Upload limiting.** `POST /products` sits behind `uploadLimiter`, which is defined in `routes.ts`.
- **PUT semantics.** `PUT` requires every writable scalar field except `taxClass`, `rateType`, `sku`, `weight`, `releaseDate` and `restockDate`. Omitting one of those six clears it.
