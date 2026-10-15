---
source: src/modules/returns/controllers/get-returns.ts
sha256: 15f067464a04bf8338767f9ea716aeb40dd9723bf3488b9e17ab42f2266be5f7
generated_at: 2026-10-15T11:51:26.334271+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/controllers/get-returns.ts

## Purpose

HTTP handler for `GET /returns`. Returns a paginated list of returns: all returns for staff callers, only their own returns for non-staff callers. Visibility scoping is decided entirely by the service layer from the auth context — never from a query parameter.

## Key elements

- **`listReturnsQuerySchema`** (module-level const) — Extends the generated `ListReturnsQueryParams` (from `@api/schemas.zod`) with `page` and `pageSize` fields coerced via `pageSchema` / `pageSizeSchema`, so the raw string values from a query string are validated and typed.
- **`getReturns`** (exported const, Express handler) — Parses `request.query` against `listReturnsQuerySchema`, pulls the non-null `request.authContext` (set upstream by `isAuth` middleware), delegates to `returnService.listReturns(parsed, authContext)`, and sends the result via `successResponse`. Errors are funnelled through `catchAs(response, 'getReturns')`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Supplies `parseBody` (query-string validation) and `catchAs` (async error → HTTP response mapping).
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse` for the 200 reply.
- **`src/infrastructure/http/schemas.ts`** — Supplies `pageSchema` and `pageSizeSchema` (Zod string→number coercions) used to build `listReturnsQuerySchema`.
- **`src/modules/returns/services/index.ts`** — Exports `returnService`; the handler calls `returnService.listReturns(query, authContext)` and relies on the service to apply the staff-vs-self scoping.
- **`src/modules/returns/routes.ts`** — Registers `getReturns` as the handler for the `GET /returns` route (and likely mounts the `isAuth` middleware that populates `request.authContext`).

## Notes

- `request.authContext!` uses a non-null assertion; correctness depends on `isAuth` middleware running before this handler. There is no runtime guard in this file.
- `parseBody` is named "body" but is used here for **query** parameters — it is a generic "parse a request segment against a Zod schema" helper, not limited to `request.body`.
- The module doc-comment explicitly states the scoping rule (service-side, caller-based). Any future query-param like `?staff=true` would violate that contract.
