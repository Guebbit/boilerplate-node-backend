---
source: src/modules/products/openapi.yaml
sha256: 78f35d1e9f35fa18b363b441457ca48d916a0e57f769542235b520e1afef376d
generated_at: 2026-10-29T05:27:20.875205+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/openapi.yaml

## Purpose

OpenAPI 3.1.0 module contract for the **Products** module. It defines the HTTP surface (list, create, delete, detail, facets) and the request/response schemas that the module's controller implements. Serves as the single source of truth for client codegen, validation, and documentation of the product catalogue API.

## Key elements

- **`tags: Products`** — all operations are tagged under this single namespace (browsing, searching, managing products and images).
- **`x-error-codes`** — module-specific error extensions; currently defines `PRODUCT_NOT_DELETED` (409, restore attempted on a non-deleted product).
- **`GET /products`** (`listProducts`) — paginated, filterable listing. Accepts sort (JSON:API `?sort=-price,title`), category, tag, price range, title, `active`, `purchasable`, and `deleted` query params. Public (empty security array) or authenticated.
- **`POST /products`** (`createProduct`) — creates a product with optional multipart image upload. Requires `bearerAuth` or `apiKeyAuth`. Enforces a non-null fallback locale in `translations`. Returns `201` + `Location` header; `429` guarded by `uploadLimiter`.
- **`DELETE /products`** (`deleteProduct`) — body-based delete (id in body). `hardDelete` flag readable from query *or* body; `true` from any source wins. `x-alias-of: deleteProductById` links it to the path-param form.
- **`GET /products/facets`** (`getCatalogueFacets`) — public, fully cacheable (`public, max-age=3600, stale-while-revalidate=60, stale-if-error=300`). Returns category/tag counts for filter chips.
- **`GET /products/{id}`** (`getProductById`) — detail endpoint. `x-versioned: [get, put, patch, delete]` signals the bundler adds `ETag`/`If-Match` + `412`. Response body varies by caller permissions (`read:Translation`, `display:Locale`); `Cache-Control` downgrades to `private, no-cache` for privileged views.
- **`#/components/schemas/*`** — module-local schemas (`Product`, `ProductsResponse`, `CreateProductRequest`, `CreateProductRequestMultipart`, `DeleteProductRequest`, `ProductSort`, `CatalogueFacetsResponse`, etc.) referenced by the paths above.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — the file `$ref`s this root spec for all shared building blocks: common parameters (`PageParam`, `PageSizeParam`, `TextParam`, `IdParam`, `IdPathParam`, `HardDeleteParam`), standard responses (`Unauthorized`, `Forbidden`, `Conflict`, `NotFound`, `ValidationError`, `NoContent`, `TooManyRequests`), and headers (`Location`). Keeping these in the root spec lets other modules reuse the same definitions without duplication.
- **`src/modules/products/module.ts`** — the module's entry point that mounts the controller and routes this spec describes. The `operationId` values here (`listProducts`, `createProduct`, `deleteProduct`, `getCatalogueFacets`, `getProductById`) correspond to handler functions wired up in that module file.

## Notes

- **Dual-source filter merging:** `GET /products?category=x` and `POST /products/search {category}` hit the same controller logic; params are declared on both the query and the request body. The `category`, `tag`, and price params are intentionally listed here *and* in `SearchProductsRequest` for this reason.
- **`purchasable` is public:** off-sale status is not a privilege gate — any caller can filter to `purchasable=false`.
- **`deleted` is privilege-gated:** callers without permission to see soft-deleted rows get an empty page for `deleted=true`, not an error.
- **Cache semantics are permission-aware:** endpoints that can return caller-specific data (draft translations, deleted rows) must emit `private, no-cache`; the spec documents this per-response rather than via a single global rule.
- **`x-versioned`** is a custom extension consumed by the build pipeline, not standard OpenAPI. It does not change the wire format — it instructs codegen/bundling to inject ETag handling.
- **Fallback locale invariant:** `CreateProductRequest.translations` MUST include a non-null entry for `NODE_FALLBACK_LOCALE`; the contract treats a product without one as impossible.
