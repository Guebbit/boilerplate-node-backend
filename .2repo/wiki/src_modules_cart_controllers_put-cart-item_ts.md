# src/modules/cart/controllers/put-cart-item.ts

## Purpose
Thin HTTP adapter for `PUT /cart/:productId`. Validates the incoming request, extracts the user and product identifiers, and delegates all business logic to `cartService.cartItemUpdateQuantity`. It exists solely to translate between Express's request/response lifecycle and the cart service's domain API.

## Key elements
- **`putCartItem`** (exported) — The route handler. Resolves `userId` from auth context, parses and validates the body against `UpdateCartItemByIdBody` (Zod), reads `productId` (path param or body) via `readInput`, checks it is a valid ObjectId, then calls `cartService.cartItemUpdateQuantity(userId, productId, quantity, callerContext)`. Responds with `successResponse` on success, `rejectResponse(422)` for a malformed ObjectId, and delegates error handling to `catchAs`.
- **`refused(response, result)`** — Checked after the service call; if the service signalled a refusal (e.g. product not visible in storefront), the response is short-circuited before `successResponse`.

## Relationships
- **`src/modules/cart/services/index.ts`** — Imports `cartService` and calls its `cartItemUpdateQuantity` method; this is the sole business-logic dependency.
- **`src/infrastructure/http/controller.ts`** — Provides `parseBody`, `refused`, and `catchAs` helpers that structure the request-parsing / service-call / error-handling flow.
- **`src/infrastructure/http/request.ts`** — Provides `authContextOf`, `callerContextOf`, `readInput`, and `isValidObjectId` used to extract and validate inputs.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` and `rejectResponse` for uniform HTTP responses.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — Provides the `t()` function used to localise the 422 error message.
- **`src/modules/cart/routes.ts`** — Registers `putCartItem` as the handler for the `PUT /cart/:productId` route.
- **`src/types/index.ts`** — Supplies the `UpdateCartItemByIdRequest` type used in the Express `Request` generic.

## Notes
- `productId` is resolved via `readInput` with `surface: 'write'`, meaning it may arrive in **either** the path parameter or the request body — not just the path.
- The doc comment notes that a 404 for a product the storefront wouldn't show is raised by the same code path (`cartItemSetById`) that `POST /cart` uses, so PUT and POST share that guard rather than duplicating it.
- The controller performs **no** business logic itself; quantity semantics, stock checks, and cart-state mutations all live in the service.
