# src/modules/orders/controllers/get-orders.ts

## Purpose

HTTP handler for `GET /orders`. Validates and normalises the search query (or body) parameters, enforces admin vs. non-admin scoping, then delegates to `orderService.search` and returns a standard success/error response. It exists as the thin controller layer between the Express route and the orders domain service.

## Key elements

- **`GetOrdersQuery`** (type export) — maps every `SearchOrdersRequest` key to `string`, modelling what a GET query-string actually carries.
- **`searchOrdersQuerySchema`** — Zod schema built on the orval-generated `SearchOrdersBody`, extended with `pageSchema` / `pageSizeSchema` so all four search endpoints share one pagination contract.
- **`searchOrdersKeyParameters`** (const export) — `Object.keys(searchOrdersQuerySchema.shape)`; the canonical list of parameters that affect the response and therefore the cache key. Deriving it from the schema (rather than hand-listing) prevents drift between validation and caching.
- **`getOrders`** (function export) — the Express handler. Reads input via `readInput`, strips `userId` for non-admin callers, validates with `parseBody`, calls `orderService.search` with the caller scope, and responds via `successResponse` / `catchAs`.

## Relationships

- **`src/modules/orders/routes.ts`** — registers `getOrders` on the `GET /orders` route.
- **`src/modules/orders/service.ts`** — provides `orderService.search()` and `orderService.callerScope()`; this controller does no business logic itself.
- **`src/infrastructure/http/controller.ts`** — supplies `parseBody` (Zod validation + error short-circuit) and `catchAs` (unified error response).
- **`src/infrastructure/http/request.ts`** — supplies `readInput` (unified query/body extraction) and `callerContextOf` (auth context forwarded to the service).
- **`src/infrastructure/http/response.ts`** — supplies `successResponse` for the happy path.
- **`src/infrastructure/http/schemas.ts`** — supplies `pageSchema` and `pageSizeSchema` so pagination rules are centralised.
- **`src/types/index.ts`** — supplies the `SearchOrdersRequest` type that shapes both the query type and the input contract.

## Notes

- **Non-admin `userId` is silently dropped** before validation; `orderService.callerScope` is the sole authority on whose orders are visible. Do not re-introduce a user-supplied `userId` path.
- **`page`/`pageSize` arrive as strings** (GET query params) and are coerced by the schemas. `normalizePagination` (in the service layer) owns default values—absent stays absent here.
- **Cache-key safety:** any parameter added to `searchOrdersQuerySchema` is automatically included in `searchOrdersKeyParameters`. If you add a query field outside the schema it will be stripped by the validator and won't appear in the key, so two requests differing only on that field would share one cached response.
- The comment references `docs/theory/request-input.md` for the rationale behind the single `readInput` call pattern.
