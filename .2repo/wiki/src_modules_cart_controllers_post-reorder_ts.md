# src/modules/cart/controllers/post-reorder.ts

## Purpose

Thin HTTP adapter for `POST /cart/reorder/:orderId`. It extracts the authenticated user and target order from the request, delegates all business logic to `cartService.reorderIntoCart`, and translates the service result into an Express response (200 or 409). No domain logic lives here.

## Key elements

- **`postReorder`** (exported const) — The sole controller. Reads `userId` from the auth context, `orderId` from route params, calls `cartService.reorderIntoCart(userId, orderId, callerContext)`, then either short-circuits via `refused()` (409) or sends `successResponse` (200). Errors are funneled through `catchAs`.

## Relationships

- **`src/modules/cart/services/index.ts`** — Supplies `cartService`; the only business-logic call in this file is `cartService.reorderIntoCart`.
- **`src/infrastructure/http/request.ts`** — Provides `authContextOf` (user identity) and `callerContextOf` (client metadata passed downstream to the service).
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` for the 200 path.
- **`src/infrastructure/http/controller.ts`** — Provides `refused` (renders the 409 "nothing to add" case) and `catchAs` (uniform error serialization).
- **`src/modules/cart/routes.ts`** — Registers `postReorder` on the `POST /cart/reorder/:orderId` route.

## Notes

- The endpoint is a POST (write to cart) even though the source order is only read; the doc comment calls this out explicitly.
- If every line of the referenced order has been removed from the catalogue, the service signals "refused" and the controller answers **409** rather than returning a 200 with an empty cart.
- Product-line skipping (catalogue-removed items) is handled inside `reorderIntoCart`; the controller does not filter lines itself.
