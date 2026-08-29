# src/modules/cart/controllers/put-cart-item.ts

## Purpose

HTTP handler for `PUT /cart/:productId`. It validates the request body and `productId`, then delegates to `cartService.cartItemUpdateQuantity` to set (or create) a cart line for the authenticated user, returning the updated cart.

## Key elements

- **`putCartItem`** (exported) — The sole handler. Reads the auth user, parses the body against `UpdateCartItemByIdBody` (Zod), resolves `productId` via `readInput` (path param or body), validates it as an ObjectId, calls the service, and writes either a success or rejection response.

## Relationships

- **`src/modules/cart/routes.ts`** — Registers this handler as the target of the `PUT /cart/:productId` route.
- **`src/modules/cart/services/index.ts`** — Provides `cartService`, whose `cartItemUpdateQuantity` performs the actual quantity set / line creation.
- **`src/infrastructure/http/controller.ts`** — Supplies `parseBody` (Zod validation + early return), `refused` (service-level rejection short-circuit), and `catchAs` (unified error mapping).
- **`src/infrastructure/http/request.ts`** — Supplies `authContextOf` (user id), `readInput` (param/body extraction), `isValidObjectId`, and `callerContextOf` (forwarded to the service).
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse` and `rejectResponse` for consistent response shaping.
- **`src/infrastructure/i18n/index.ts`** / **`context.ts`** — Provides `t()` for the `generic.error-missing-data` message used in the 422 path.
- **`src/types/index.ts`** — Defines the `UpdateCartItemByIdRequest` type used in the handler signature.

## Notes

- Semantically equivalent to `POST /cart` for a product that is no longer in the storefront: both 404 from the same service method (`cartItemSetById`), so "upsert" is the real behavior here.
- `productId` is accepted from either the path param or the body (`readInput` with `surface: 'write'`); the path param is the expected channel but the helper tolerates body fallback.
- The handler uses `.then`/`.catch` rather than `async/await`; the `catchAs` callback is keyed on `'updateCartItemById'` for centralized error-to-status mapping.
- A 422 (not 400) is returned when `productId` is present but not a valid ObjectId.
