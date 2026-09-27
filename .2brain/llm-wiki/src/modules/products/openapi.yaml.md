---
source: src/modules/products/openapi.yaml
sha256: 2d6c8fc2afdd240a6f8d793688225d32e2aa3a6f6da497a9dfc5d4c706d3988a
generated_at: 2026-09-27T15:32:57.723755+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/openapi.yaml

## Purpose

OpenAPI 3.0.3 specification (v2.0.0) defining the full HTTP contract for the Products module: routes, parameters, request/response schemas, and error semantics. It exists as the single source of truth for what the products API exposes, enabling codegen, client typing, and documentation without reading the controllers.

## Key elements

- **`/products` (GET)** – Paginated, filterable product list. Accepts `category`, `tag`, `minPrice`, `maxPrice`, `title`, `active`, `deleted` as query params. The `deleted` flag is tri-state (true / false / absent) and is permission-gated.
- **`/products` (POST)** – Create a product. Accepts JSON or `multipart/form-data` (image upload). Requires `bearerAuth`. Returns 201.
- **`/products` (DELETE)** – Delete by body-supplied `id`. `hardDelete` flag readable from query *or* body (OR semantics). Marked `x-alias-of: deleteProductById`.
- **`/products/categories` (GET)** – Public (`security: []`) catalogue facets: every category/tag with a visibility-aware product count, sorted count-desc then name.
- **`/products/{id}` (GET)** – Single product by path param. Functionally equivalent to `GET /products?id=…`.
- **`/products/{id}` (PUT)** – Full replace. Omitted scalars are *cleared*; `translations` still uses per-locale upsert/delete semantics (not wholesale replace).
- **`/products/{id}` (PATCH)** – Partial merge. `translations` merges one locale at a time with three signals (upsert / delete / no-change).
- **Local schemas** – `ProductsResponseEnvelope`, `ProductEnvelope`, `CreateProductRequest(Multipart)`, `ReplaceProductRequest(Multipart)`, `UpdateProductRequest`, `DeleteProductRequest`, `CatalogueFacetsEnvelope` (referenced but defined below the truncated portion).
- **Shared $refs** – Parameters (`PageParam`, `PageSizeParam`, `TextParam`, `IdParam`, `HardDeleteParam`, `IdPathParam`) and standard error responses are pulled from the shared root spec.

## Relationships

- **`shared/contracts/openapi.root.yaml`** – This file `$ref`s shared parameter definitions and canonical error responses (401, 403, 404, 409, 422, 429, 500) from that root. Changes to shared response shapes propagate here automatically; this file only contributes product-specific schemas and path-level logic.
- **`src/modules/products/module.ts`** – The module entry that registers the products routes and middleware (e.g. `uploadLimiter` noted in comments). The OpenAPI spec here is the contract that `module.ts`'s controllers implement; `operationId` values in this file map 1:1 to the handler names expected by the module's router.

## Notes

- **Dual-source params**: Several filters (e.g. `category`, `hardDelete`) are declared both as query params *and* inside the request body because the controller merges both sources. The spec declares them in both places intentionally — they are not redundant.
- **PUT ≠ PATCH for `translations`**: PUT and PATCH share per-locale upsert/delete semantics for translations, even though PUT is "full replace" for every other scalar. The spec explicitly calls this out in descriptions.
- **`deleted` param is permission-aware**: A caller lacking the "see deleted" permission gets an empty page for `deleted=true` rather than a 403. Documented in the param description.
- **Rate limiting**: 429 responses on POST and PUT are gated by an `uploadLimiter` middleware applied in `routes.ts` (not in this spec file). The spec only documents the possible status code.
- **Locale requirement on create**: The fallback locale (`NODE_FALLBACK_LOCALE`) must be present and non-null in `translations`; a product with no fallback "cannot exist."
- **Path duplication**: `GET /products/{id}` and `GET /products?id=…` are the same operation served by the same controller; the spec documents both for client convenience.
