# src/modules/products/controllers/get-product-item.ts

## Purpose

Thin HTTP handler for `GET /products/:id`. Wires the shared `createItemController` factory to `productService.getByIdViewed`, passing a caller-scoped visibility filter so that non-admin callers only ever see active products.

## Key elements

- **`getProductItem`** (exported const) — The route handler. Built by `createItemController` with:
  - `entity: 'product'`
  - `notFoundKey: 'products.not-found'` — i18n key returned on 404.
  - `fetch(id, request)` — Calls `productService.getByIdViewed(id, scope, callerCtx)` where scope comes from `productService.callerScope(request.authContext)` and caller context from `callerContextOf(request)`.

## Relationships

- **`src/infrastructure/surfaces/create-item-controller.ts`** — Supplies the `createItemController` factory that turns the `fetch` closure into a standard HTTP response handler (status codes, error mapping).
- **`src/modules/products/service.ts`** — Source of `productService.getByIdViewed` (actual row lookup) and `productService.callerScope` (visibility filter derived from the caller's role).
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf`, used to extract request-level caller metadata passed as the third argument to `getByIdViewed`.
- **`src/modules/products/routes.ts`** — Mounts `getProductItem` on `/products/:id` and applies `getAuth` middleware; this is what populates `request.authContext` before the handler runs.

## Notes

- Visibility is role-gated at the **service** layer, not here: only an admin caller can retrieve inactive or deleted products. The controller itself contains no role checks.
- `request.authContext` is populated by the route's `getAuth` middleware (in `routes.ts`), not by anything in this file. If the route is ever changed to skip auth, `callerScope` will receive `undefined` and the visibility contract silently breaks.
