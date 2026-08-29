# src/modules/products/openapi.yaml

## Purpose

OpenAPI 3.0.3 contract for the Products module (v2.0.0). Defines the full REST surface for product CRUD, catalogue facet listing, and the dual-route pattern (body-id vs path-id) that the shared controller serves. Clients and code generators consume this file to type requests/responses; the shared contract file supplies reusable parameters, error responses, and the `HardDeleteRequest` schema.

## Key elements

- **`GET /products`** (`listProducts`) — Paginated product listing. Accepts shared pagination/search params *plus* module-specific filters (`category`, `tag`, `minPrice`, `maxPrice`, `title`, `active`). Filters are intentionally duplicated in the `SearchProductsRequest` body so a single controller can read them from either source.
- **`POST /products`** (`createProduct`) — Create a product. Accepts `application/json` or `multipart/form-data` (image upload). Requires `bearerAuth`.
- **`PUT /products`** (`updateProduct`) — Update by body-id. `x-alias-of: updateProductById`. Same dual content-type support.
- **`DELETE /products`** (`deleteProduct`) — Delete by body-id. `x-alias-of: deleteProductById`. The `hardDelete` flag is readable from query *and* body; a `true` from any source wins over a `false` elsewhere.
- **`GET /products/categories`** (`getCatalogueFacets`) — Public endpoint (no auth) returning every visible category/tag with its product count, sorted count-desc then name. Intended as filter-chip data for storefronts.
- **`GET /products/{id}`** (`getProductById`) — Path-parameter alias for fetching a single product.
- **`PUT /products/{id}`** (`updateProductById`) — Path-parameter alias for `PUT /products`.
- **`DELETE /products/{id}`** (`deleteProductById`) — Path-parameter alias for `DELETE /products`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — Referenced for shared parameters (`PageParam`, `PageSizeParam`, `TextParam`, `IdParam`, `IdPathParam`, `HardDeleteParam`), standard error responses (`ValidationError`, `InternalError`, `Unauthorized`, `Forbidden`, `NotFound`, `Success`), and the `HardDeleteRequest` schema. All `$ref`s use the relative path `../../../shared/contracts/openapi.root.yaml`.

## Notes

- **Dual-route aliases:** `PUT /products` / `DELETE /products` and their `/products/{id}` counterparts are the *same controller operation* exposed two ways (id in body vs id in path). The `x-alias-of` extension records this; treat them as one logical endpoint.
- **`hardDelete` precedence:** A `true` value from *any* source (query, body) is authoritative; a `false` in another source does not cancel it. This is documented in the spec's description rather than enforced by schema.
- **Filter parameter duplication:** `category`, `tag`, `minPrice`, `maxPrice` appear both as query params on `GET /products` and inside `SearchProductsRequest`. This is deliberate — the controller merges both sources — not an oversight.
- **`security: []`** on `getCatalogueFacets` means the endpoint is explicitly public; all other mutating endpoints require `bearerAuth`.
- **Multipart support:** `POST` and `PUT` (both route variants) accept `multipart/form-data` alongside JSON, enabling inline image upload without a separate endpoint.
