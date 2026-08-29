# src/modules/cart/controllers/delete-cart-item.ts

## Purpose

Route handler for `DELETE /cart/:productId`. Validates the path parameter and delegates removal to the cart service, returning the updated cart or a structured error.

## Key elements

- **`deleteCartItem`** (sole export) — Express handler that reads `productId` from the path, validates it as an ObjectId, calls `cartService.cartItemRemoveById`, and emits a `200` (with updated cart + localized message) or an error response.

## Relationships

- **`src/modules/cart/routes.ts`** — registers `deleteCartItem` as the handler for `DELETE /cart/:productId`.
- **`src/modules/cart/services/index.ts`** — source of `cartService.cartItemRemoveById`, which performs the actual removal and returns 404 if the item is absent.
- **`src/infrastructure/http/request.ts`** — supplies `authContextOf`, `readInput`, `callerContextOf`, and `isValidObjectId` used in the controller body.
- **`src/infrastructure/http/response.ts`** — supplies `successResponse` and `rejectResponse` for output formatting.
- **`src/infrastructure/http/controller.ts`** — supplies `catchAs` (promise-rejection → error response) and `refused` (service-level rejection → response short-circuit).
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — provides `t()` for the localized "product removed" and "missing data" messages.
- **`src/types/index.ts`** — defines `RemoveCartItemRequest` used in the handler's generic signature.

## Notes

- **Path-param only, by design.** `productId` is read with `{ surface: 'path' }`; there is intentionally no body field. The route cannot match without the URL segment, so a body `productId` would be unreachable. This differs from `PUT /cart/:productId`, which does accept a body (`UpdateCartItemByIdRequest`).
- **Error split.** The controller only guards against an invalid ObjectId (→ 422). The 404 "item not in cart" case is raised by the service layer and handled via `refused`/`catchAs` — do not expect it here.
- **`callerContextOf(request)`** is forwarded to the service; it carries caller metadata (e.g. locale, session hints) that the service may use.
