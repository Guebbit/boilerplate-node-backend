# src/modules/products/openapi.yaml

## Purpose

OpenAPI 3.0.3 specification that defines the full HTTP contract for the products module: CRUD operations on products, a public catalogue-facets endpoint, and the request/response schemas that bind them. It serves as the single source of truth for client code-generation, validation, and documentation of the products API surface.

## Key elements

- **`GET /products`** — Paginated product list. Accepts filtering via `category`, `tag`, `minPrice`, `maxPrice`, `title`, `active` (all optional query params) plus shared pagination/search params.
- **`POST /products`** — Create a product. Accepts `application/json` or `multipart/form-data` (for image upload). Requires `bearerAuth`.
- **`PUT /products`** — Update a product by id in the body. Same dual content-type support. Marked `x-alias-of: updateProductById`.
- **`DELETE /products`** — Soft-delete (default) or hard-delete (`hardDelete=true` in query or body). Marked `x-alias-of: deleteProductById`.
- **`GET /products/categories`** — Public, unauthenticated (`security: []`). Returns every category and tag with product counts for storefront filter chips.
- **`GET /products/{id}`** — Product detail; functionally equivalent to `GET /products?id={id}`.
- **`PUT /products/{id}`** — Update by path id; equivalent to `PUT /products`.
- **`DELETE /products/{id}`** — Delete by path id; equivalent to `DELETE /products`.
- **Schemas** (in `components/schemas`): `ProductsResponseEnvelope`, `ProductEnvelope`, `CreateProductRequest` / `…Multipart`, `UpdateProductRequest` / `…Multipart`, `UpdateProductByIdRequest` / `…Multipart`, `DeleteProductRequest`, `CatalogueFacetsEnvelope`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — Primary source for all shared parameters (`PageParam`, `PageSizeParam`, `TextParam`, `IdParam`, `IdPathParam`, `HardDeleteParam`), shared error/success responses (`ValidationError`, `InternalError`, `Unauthorized`, `Forbidden`, `NotFound`, `Success`), and the `HardDeleteRequest` schema. Every non-product-specific fragment is `$ref`'d from this file.
- **`src/modules/users/openapi.yaml`**, **`src/modules/wishlist/openapi.yaml`** — Sibling module specs in the same directory structure. No direct `$ref` to this file is visible in the content shown; they coexist as independent API surfaces.

## Notes

- **Duplicate filter declaration (intentional):** `category`, `tag`, `minPrice`, `maxPrice`, `title`, `active` appear both as query params on `GET /products` and inside the search request body. The controller merges query and body, so `GET /products?category=x` and `POST /products/search {category}` are the same filter reached two ways.
- **`hardDelete` precedence:** A `true` from *any* source (query param or body) wins. A `false` sent in another source does **not** cancel it.
- **`x-alias-of` extension:** Non-standard OpenAPI key used to flag that `/products` (body-id) and `/products/{id}` (path-id) routes are served by the same controller and are interchangeable.
- **Multipart variants:** Create and update each have a `…Multipart` schema alongside the JSON one, supporting optional image upload via `multipart/form-data`.
- **Auth asymmetry:** `GET /products/categories` is the only endpoint explicitly unauthenticated; all mutations require `bearerAuth`. `GET /products` and `GET /products/{id}` do not declare a `security` requirement.
