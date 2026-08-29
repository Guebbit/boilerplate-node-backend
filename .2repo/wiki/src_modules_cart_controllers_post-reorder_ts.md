# src/modules/cart/controllers/post-reorder.ts

## Purpose

Handler for `POST /cart/reorder/:orderId`. Copies the line items from one of the caller's own orders back into their cart, skipping any lines whose product has since been delisted. Lives in the cart module (not orders) because its write target is the cart; the source order is read-only.

## Key elements

- **`postReorder`** (exported) – The sole export. Reads `userId` from the auth context and `orderId` from route params, delegates to `cartService.reorderIntoCart`, then maps the result onto the HTTP response. Returns `200` with the updated cart view and an optional message, or `409` if no line items remained to add.

## Relationships

- **`src/infrastructure/http/controller.ts`** – Provides `refused` (short-circuits to an error status when the service signals rejection) and `catchAs` (standard error-to-response mapping keyed by the controller name).
- **`src/infrastructure/http/request.ts`** – Provides `authContextOf` (extracts the authenticated user's id) and `callerContextOf` (supplies request-scoped context such as locale or client metadata) passed through to the service call.
- **`src/infrastructure/http/response.ts`** – Provides `successResponse`, the shared helper that serializes `{ data, message }` into the JSON body with the given status code.
- **`src/modules/cart/services/index.ts`** – Source of `cartService`, whose `reorderIntoCart(userId, orderId, callerContext)` method contains all business logic (ownership check, catalogue filtering, cart write).
- **`src/modules/cart/routes.ts`** – Registers `postReorder` on the `POST /cart/reorder/:orderId` route.

## Notes

- The response body on success is the *current* cart view, not just the copied lines—clients should treat it as the authoritative cart state.
- A `409` (not `422` or `200-with-empty-array`) signals "order existed but nothing could be re-added," letting clients distinguish "delisted everything" from "invalid request."
- The controller performs no validation or filtering itself; all domain rules (ownership, catalogue lookup, skip logic) live in `cartService.reorderIntoCart`.
