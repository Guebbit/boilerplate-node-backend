---
source: src/modules/products/openapi.yaml
sha256: 1fcb2441ca12acbd4cb6ea6441f4554805cc231ecf1b58382bf93db2523ed813
generated_at: 2026-09-23T19:27:38.399086+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/openapi.yaml

## Purpose

OpenAPI 3.0.3 specification for the Products module. It declares the full REST surface (list, create, read, edit, delete, catalogue facets) so that tooling, docs, and the module's runtime contract are generated from a single source of truth rather than hand-maintained.

## Key elements

- **`GET /products`** — Paginated product listing with rich query filters (`category`, `tag`, `minPrice`, `maxPrice`, `title`, `active`). Mirrors the filters also available via `POST /products/search`; the controller merges query and body so both forms hit the same code path.
- **`POST /products`** — Create a product. Accepts `application/json` or `multipart/form-data` (image upload). Requires the fallback locale to be present in `translations`. Subject to `uploadLimiter` (429).
- **`DELETE /products`** / **`DELETE /products/{id}`** — Functionally equivalent delete routes served by one controller. `hardDelete` is readable from query *or* body; a `true` from any source wins over a `false` elsewhere. Marked with `x-alias-of: deleteProductById`.
- **`GET /products/categories`** — Public, unauthenticated catalogue facets: every category and tag with a count of visible products, sorted by count desc then name. Powers storefront filter chips.
- **`GET /products/{id}`** — Full product detail. Equivalent to `GET /products?id={id}`.
- **`PATCH /products/{id}`** — Merge-update (not replace). `translations` uses three-way semantics per locale: key absent → no-op, object → upsert, `null` → delete row. Empty object `{}` is a 422; `null` on the fallback locale is a 422. Accepts `multipart/form-data` for image re-upload.
- **Shared `$ref`s** — Parameters (`PageParam`, `PageSizeParam`, `IdPathParam`, `HardDeleteParam`, etc.) and error responses (`ValidationError`, `Unauthorized`, `Forbidden`, `NotFound`, `TooManyRequests`, `InternalError`) are pulled from the root contract.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — Every cross-cutting parameter, response, and security scheme is `$ref`'d from this file. The products spec is a *fragment* that composes onto the root; it never redefines shared types.
- **`src/modules/products/module.ts`** — The module entry point that registers these routes at runtime and wires up the controller, `uploadLimiter`, and any middleware. The OpenAPI spec is the contract that `module.ts` is expected to satisfy.

## Notes

- **Dual routes are intentional.** `DELETE /products` and `DELETE /products/{id}` (and similarly `GET /products?id=x` / `GET /products/{id}`) share one controller. Do not treat them as separate implementations.
- **`hardDelete` is "any-true-wins."** A `false` in one source (query vs. body) does not cancel a `true` in another. This is documented inline and is a deliberate design choice, not an oversight.
- **Translations merge ≠ replace.** The PATCH description spells out the three-signal table (absent / object / null). An empty object `{}` is explicitly *not* a delete; only `null` deletes a locale row. This guards against accidental data loss from cleared form fields.
- **`uploadLimiter` is external.** The 429 responses on `POST /products` and `PATCH /products/{id}` are enforced by middleware in `routes.ts`, not by the spec itself. The spec documents the response; the rate-limiting logic lives elsewhere.
- **File is truncated in the repo snapshot** — the `components.schemas` section (e.g. `ProductsResponseEnvelope`, `CreateProductRequest`, `ProductEnvelope`, `CatalogueFacetsEnvelope`) is referenced but not shown here. See the full file for schema definitions.
