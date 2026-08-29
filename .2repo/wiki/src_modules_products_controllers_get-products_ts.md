# src/modules/products/controllers/get-products.ts

## Purpose

Express controller that handles `GET /products` and `POST /products/search`. It validates incoming query-string or body parameters through a zod schema, coerces string-typed query values into their proper types, then delegates the actual lookup to `productService.searchViewed` with the caller's scope and context.

## Key elements

- **`GetProductsQuery`** — Exported type alias: `Partial<Record<keyof SearchProductsRequest, string>>`, representing the raw query-string shape before validation.
- **`searchProductsQuerySchema`** (module-private) — Extends the orval-generated `SearchProductsBody` with `page`, `pageSize`, `minPrice`, `maxPrice`, and `active`. Uses `z.preprocess` to coerce empty strings → `undefined` and text → number/boolean, since GET params arrive as strings.
- **`searchProductsKeyParameters`** — Exported `string[]` derived from `Object.keys(searchProductsQuerySchema.shape)`. Serves as the canonical list of query params that affect the response (and therefore the cache key).
- **`getProducts`** — The Express handler. Reads input via `readInput`, parses it with `parseBody`, calls `productService.searchViewed(parsed, scope, context)`, and writes the result with `successResponse` / errors with `catchAs`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Supplies `parseBody` (schema validation with early-exit error response) and `catchAs` (unified async error → HTTP response).
- **`src/infrastructure/http/request.ts`** — Supplies `readInput` (unified body/query extraction) and `callerContextOf` (resolves per-request caller metadata for auditing/tracing).
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse` for the standard 200 envelope.
- **`src/infrastructure/http/schemas.ts`** — Supplies `pageSchema` and `pageSizeSchema` so pagination validation is shared across all four search endpoints.
- **`src/modules/products/service.ts`** — `productService.searchViewed` performs the actual query; `productService.callerScope` maps `request.authContext` to an admin/public scope (admin sees inactive/deleted, public sees active only).
- **`src/modules/products/routes.ts`** — Registers `getProducts` as the handler for the product list/search routes.
- **`src/types/index.ts`** — Provides the `SearchProductsRequest` type used in the `GetProductsQuery` alias and the Express generic for the handler signature.
- **`@api/schemas.zod`** — Source of `SearchProductsBody` and the `minPrice`/`maxPrice` lower-bound constants; kept in sync with `openapi.yaml`.

## Notes

- **String coercion is intentional and non-trivial.** GET query params are always strings; the `z.preprocess` steps map `''`/`null` → `undefined` (so absent stays absent) and then `z.coerce.number()` / `z.boolean()` handle the conversion. The `active` field specifically checks `value === 'true'` because a query string can only express booleans as text.
- **Cache-key coupling.** `searchProductsKeyParameters` is derived from the schema shape, not hand-listed. If you add a field to the schema, it automatically enters the key; if you read a param in the handler but forget to add it to the schema, the validator strips it and it never reaches the key. The two are kept in sync by construction.
- **`category` / `tag` take only the first value** when an array or CSV is supplied (`coerceStringArray(...)[0]`), because the OpenAPI spec models them as single-value filters.
- **Pagination defaults are not set here.** `page`/`pageSize` are optional in the schema; `normalizePagination` (lived elsewhere) owns applying defaults. This controller passes them through as-is or `undefined`.
- The inline comment references `docs/theory/request-input.md` for the rationale behind `readInput`'s single-declaration pattern.
