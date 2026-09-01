# src/modules/cart/controllers/get-cart-summary.ts

## Purpose

Thin HTTP adapter for `GET /cart/summary`. Translates an incoming Express request into a call to the cart service's badge-summary method and sends back the summary object. Exists so the route layer never touches business logic directly.

## Key elements

- **`getCartSummary`** (exported) — Request handler for `GET /cart/summary`. Extracts the authenticated user id via `authContextOf(request).id`, calls `cartService.cartGetForBadge(id)`, and responds with `cart.summary` through `successResponse`. Errors are delegated to `catchAs(response, 'getCartSummary')`.

## Relationships

- **`src/modules/cart/services/index.ts`** — Source of `cartService`; this controller calls its `cartGetForBadge` method and expects the returned object to carry a `.summary` property.
- **`src/modules/cart/routes.ts`** — Registers `getCartSummary` on the `GET /cart/summary` route.
- **`src/infrastructure/http/request.ts`** — Provides `authContextOf`, used to pull the user id off the request.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse`, the standard 200 wrapper for this module's replies.
- **`src/infrastructure/http/controller.ts`** — Provides `catchAs`, the shared error-catch helper that formats and sends the error response.

## Notes

- The controller only returns `cart.summary`, not the full cart object. Consumers expecting line items or totals beyond the summary shape will get `undefined`.
- Authentication is assumed to be validated upstream (middleware in `routes.ts`); `authContextOf(request).id` is accessed without a null-check. If the auth guard is removed or reordered, this handler will throw on an undefined id rather than returning 401.
- The module doc-comment labels it a "thin HTTP adapter" — do not add branching or transformation logic here; keep changes in the service layer.
