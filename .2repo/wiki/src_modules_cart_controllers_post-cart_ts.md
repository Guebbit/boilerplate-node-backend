# src/modules/cart/controllers/post-cart.ts

## Purpose

Controller handler for `POST /cart`. Validates the incoming upsert request body, extracts the authenticated user's ID, and delegates the actual add-or-replace operation to `cartService.cartItemAdd`. It does not enforce any business rules about *whether* a product may be carted — that decision lives in the service so it stays consistent across cart, wishlist, and the PUT route.

## Key elements

- **`postCart`** (exported) — The sole handler. Signature: `(request: Request<…, UpsertCartItemRequest>, response: Response) => void`. Orchestrates: auth lookup → body parse → ObjectId check → service call → response.
- Uses **`parseBody(UpsertCartItemBody, …)`** to validate the raw body against the shared Zod schema and short-circuit on failure.
- Uses **`isValidObjectId(productId)`** as an extra guard because OpenAPI types the ID as a plain string.
- Calls **`cartService.cartItemAdd(userId, productId, quantity, callerContext)`** and handles the result via `refused` / `successResponse` / `catchAs`.

## Relationships

- **`src/modules/cart/routes.ts`** — registers `postCart` as the handler for the `POST /cart` endpoint.
- **`src/modules/cart/services/index.ts`** — provides `cartService`; this file calls its `cartItemAdd` method and consumes its return value.
- **`src/infrastructure/http/controller.ts`** — supplies the `parseBody`, `refused`, and `catchAs` helpers used for request/response plumbing.
- **`src/infrastructure/http/request.ts`** — supplies `authContextOf`, `callerContextOf`, and `isValidObjectId`.
- **`src/infrastructure/http/response.ts`** — supplies `successResponse` and `rejectResponse` for building the HTTP reply.
- **`src/infrastructure/i18n/index.ts`** — supplies the `t` translation function used for user-facing messages (`cart.product-added`, `generic.error-missing-data`).
- **`src/types/index.ts`** — provides the `UpsertCartItemRequest` type used in the handler's parameter signature.

## Notes

- Success returns **200**, not 201, even when a new line is created (upsert semantics).
- The comment block explicitly warns against adding cart-eligibility checks here; the same rule must hold for `PUT /cart/{productId}` and wishlist move-to-cart, so it belongs in the service layer.
- ObjectId format validation is intentionally duplicated at the controller level because the OpenAPI contract types the field as a generic string, and a 422 is preferred over letting a malformed ID reach Mongo.
