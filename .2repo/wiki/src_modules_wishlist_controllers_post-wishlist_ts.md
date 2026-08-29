# src/modules/wishlist/controllers/post-wishlist.ts

## Purpose

Controller handler for `POST /wishlist`. Validates authentication, request body (via Zod schema), and product-ID format, then delegates to the wishlist service to save a product. The operation is intentionally idempotent: saving an already-saved item returns the same `200` rather than an error.

## Key elements

- **`postWishlist`** (exported const) — the sole export. Signature takes an Express `Request<unknown, unknown, AddWishlistItemRequest>` and `Response`. Execution order:
  1. Extracts `userId` from `authContextOf(request)`.
  2. Parses and validates the body against `AddWishlistItemBody` (Zod) via `parseBody`; early-returns on failure.
  3. Validates `productId` format via `malformedProductId`; early-returns if invalid.
  4. Calls `wishlistService.wishlistAdd(userId, productId, callerContextOf(request))`.
  5. On success, sends `200` with `result.data` and `result.message` through `successResponse`.
  6. On a "refused" result, short-circuits via `refused(response, result)`.
  7. Uncaught promise rejections are handled by `catchAs(response, 'postWishlist')`.

## Relationships

- **`@infrastructure/http/controller`** — supplies the three helper functions used for parse/refuse/catch flows (`parseBody`, `refused`, `catchAs`).
- **`@infrastructure/http/request`** — supplies `authContextOf` (user identity) and `callerContextOf` (request-scoped context forwarded to the service).
- **`@infrastructure/http/response`** — supplies `successResponse` for the final 200 reply.
- **`./shared/product-id`** — supplies `malformedProductId`, which both validates and writes the error response in one call.
- **`../service`** — the `wishlistService.wishlistAdd` method performs the actual persistence/logic.
- **`@types`** — provides the `AddWishlistItemRequest` type used to type the Express request parameter.
- **`../routes`** — imports `postWishlist` and registers it on the `POST /wishlist` route (inferred from naming convention).

## Notes

- **Idempotency is a design choice**, not a side effect. The doc-comment explicitly states a duplicate save is not an error. Consumers should not expect a `409` for already-saved items.
- **Guard-clause style**: every validation step writes its own error response and `return`s; the function never throws synchronously. The only asynchronous path is the service call, which is wrapped in `.catch(catchAs(...))`.
- The runtime schema (`AddWishlistItemBody` from `@api/schemas.zod`) and the compile-time request type (`AddWishlistItemRequest` from `@types`) are separate artifacts; the Zod schema is the source of truth for shape validation.
