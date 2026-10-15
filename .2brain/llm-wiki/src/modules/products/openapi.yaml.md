---
source: src/modules/products/openapi.yaml
sha256: 453872581aee01d64081ba706bd33093ff577aef3a343525751ec4150c95d56b
generated_at: 2026-10-15T11:42:57.046403+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the products module. It defines the full HTTP surface (list, create, read-by-id, replace, patch, delete, restore, catalogue facets, and shop settings) with schemas, parameters, and error responses, serving as the single source of truth for the module's API shape. The module entry point (`module.ts`) mounts these routes; the spec is what clients, tests, and tooling consume.

## Key elements

- **`paths./products` (GET)** — Paginated product listing. Accepts `sort`, `category`, `tag`, `minPrice`, `maxPrice`, `title`, `active`, `purchasable`, and `deleted` as query filters. The `deleted` flag is admin-gated (callers without read-deleted permission get an empty page for `deleted=true`).
- **`paths./products` (POST)** — Create a product. Supports both `application/json` and `multipart/form-data` (for image upload). Requires a non-null `translations` entry for the fallback locale (`NODE_FALLBACK_LOCALE`). Protected by `uploadLimiter` (429) and enforces SKU uniqueness (409).
- **`paths./products` (DELETE)** — Alias of `deleteProductById` (`x-alias-of`). Reads `hardDelete` from query *and* body; a `true` from any source wins. Soft-delete is one-way; restore via `POST /products/{id}/restore`.
- **`paths./products/categories` (GET)** — Public, unauthenticated. Returns every category/tag with its visible-product count, sorted count-desc then name. Counts honour the same visibility rules as the listing.
- **`paths./products/settings` (GET)** — Public, unauthenticated. Exposes shop-level catalogue settings (currently `NODE_DEFAULT_CURRENCY`). Intended to be read by create-forms before a product exists.
- **`paths./products/{id}` (GET / PUT / PATCH / DELETE)** — Single-product operations. Marked `x-versioned`, meaning a bundler injects `ETag` on 200s and `If-Match` + 412 on writes. GET is functionally equivalent to `GET /products?id={id}`. PUT follows RFC 9110 §9.3.4 (full replacement); image is outside the body representation (set via upload, cleared via `imageUrl: null`, preserved when absent).
- **Shared `$ref`s** — Common parameters (`PageParam`, `PageSizeParam`, `TextParam`, `IdParam`, `IdPathParam`, `HardDeleteParam`), responses (`ValidationError`, `Unauthorized`, `Forbidden`, `NotFound`, `Conflict`, `TooManyRequests`, `InternalError`, `Success`), and headers (`Location`) are all pulled from `shared/contracts/openapi.root.yaml`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — Referenced via `$ref` for every shared parameter, error response, and header. This file does not define any of those inline; the shared contract is the canonical source for cross-module consistency.
- **`src/modules/products/module.ts`** — The module's entry point that wires this spec's operations to controllers and registers the routes. The spec's `operationId` values (e.g. `listProducts`, `createProduct`, `deleteProduct`) are the identifiers `module.ts` uses to bind handlers.

## Notes

- **Dual-filter design:** `category` and `tag` appear both as query params on `GET /products` and inside `SearchProductsRequest` (body on `POST /products/search`). The controller merges them, so the two call shapes are equivalent.
- **`hardDelete` precedence:** On both `DELETE /products` and `DELETE /products/{id}`, the flag is read from query *and* body. A `true` from either source is final; a `false` elsewhere does not override it.
- **`x-versioned` is a bundler directive, not standard OpenAPI.** It tells the build tooling to add ETag / If-Match mechanics; a raw spec parser will ignore it.
- **Locale invariant on create:** The fallback-locale translation is mandatory and non-null. A product with no fallback cannot exist. The PUT/PATCH three-way table for locale entries is documented in the `PATCH /products/{id}` description.
- **`purchasable` is intentionally public** (off-sale is a visible state), whereas `deleted` is admin-gated at the response level, not the schema level.
