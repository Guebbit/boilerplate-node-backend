# src/modules/cart/controllers/post-cart.ts

## Purpose

Thin HTTP adapter for `POST /cart`. Parses and validates the request, then delegates all business logic (eligibility, upsert semantics) to `cartService.cartItemAdd`. Exists to keep the Express layer free of domain rules.

## Key elements

- **`postCart`** (exported function) — the sole export. Signature: `(request: Request<…, UpsertCartItemRequest>, response: Response) => void`. Steps:
  1. Extracts `userId` from the auth context.
  2. Parses the body against the `UpsertCartItemBody` Zod schema via `parseBody`; short-circuits on failure.
  3. Validates `productId` with `isValidObjectId` (422 on mismatch).
  4. Calls `cartService.cartItemAdd(userId, productId, quantity, callerContextOf(request))`.
  5. On success, responds `200` with the data and the i18n string `cart.product-added`.
  6. Refusals and unexpected errors are handled by `refused` / `catchAs` respectively.

## Relationships

- **`src/modules/cart/routes.ts`** — registers `postCart` as the handler for the `POST /cart` route.
- **`src/modules/cart/services/index.ts`** — source of `cartService.cartItemAdd`, the actual add/replace logic.
- **`src/infrastructure/http/controller.ts`** — provides `parseBody`, `refused`, and `catchAs` helpers used for body validation, refusal detection, and error serialization.
- **`src/infrastructure/http/request.ts`** — provides `authContextOf` (extracts caller identity), `isValidObjectId`, and `callerContextOf` (passes through locale/device context to the service).
- **`src/infrastructure/http/response.ts`** — provides `successResponse` and `rejectResponse` for uniform HTTP reply shaping.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — provides the `t()` translator used for user-facing error and success strings.
- **`src/types/index.ts`** — supplies the `UpsertCartItemRequest` type used in the Express generics.

## Notes

- **Eligibility is intentionally out of scope here.** The comment states the "can this product be in a cart?" rule is decided by the service and *must* stay consistent with `PUT /cart/{productId}` and the wishlist move-to-cart path. Do not add product-type or availability checks in this controller.
- **ObjectId validation is a guard, not a type.** OpenAPI models the Id as a plain string, so a runtime `isValidObjectId` check is necessary before the value reaches Mongo.
- **The controller never throws synchronously.** All errors are funneled through `catchAs(response, 'upsertCartItem')` or the explicit `rejectResponse` paths.
