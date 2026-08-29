# src/modules/products/controllers/get-catalogue-facets.ts

## Purpose

Thin Express controller that exposes `GET /products/categories`, returning every category and tag in the public catalogue with counts. It exists to give the storefront its filter-chip data and is intentionally as thin as possible: delegate to the service, format the response, and funnel errors through a shared handler.

## Key elements

- **`getCatalogueFacets`** (exported) — The sole handler. Accepts `(request: Request, response: Response)`, calls `productService.facets()`, then either sends the result via `successResponse` or delegates the rejection to `catchAs(response, 'getCatalogueFacets')`. No local state, no business logic.

## Relationships

- **`src/infrastructure/http/response.ts`** — Imports `successResponse` to shape the 200 body.
- **`src/infrastructure/http/controller.ts`** — Imports `catchAs`, the shared error-catcher that maps a rejected promise to a consistent error response and logs under the label `'getCatalogueFacets'`.
- **`src/modules/products/service.ts`** — Imports `productService` and calls its `facets()` method; all catalogue-query logic lives there.
- **`src/modules/products/routes.ts`** — Registers `getCatalogueFacets` on the `GET /products/categories` route (inferred from the JSDoc path).

## Notes

- The handler uses a promise-chain (`.then`/`.catch`) style rather than `async/await`, matching the convention in this codebase's controllers.
- Per the JSDoc, the response is intended to be cached by an upstream layer (e.g., CDN or HTTP cache) and invalidated together with the products listing via a shared cache tag. The controller itself performs no caching.
- `request` is accepted but never read; the route carries all needed context.
