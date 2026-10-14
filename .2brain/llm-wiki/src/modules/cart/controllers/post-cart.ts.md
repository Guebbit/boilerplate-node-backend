---
source: src/modules/cart/controllers/post-cart.ts
sha256: c779da0c389361288f93bd2a6e1cbe8772214f7312f71002173948ebfd567d61
generated_at: 2026-10-14T15:08:02.790770+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/controllers/post-cart.ts

## Purpose

Thin HTTP adapter that handles `POST /cart`. It validates the incoming body, extracts the authenticated user, and delegates to `cartService.cartItemAdd`. It maps the service result to the appropriate HTTP status (201 if a new line was created, 200 if an existing line's quantity grew) and serializes the response. It intentionally contains no cart-eligibility logic — that decision belongs to the service layer so it stays consistent across `PUT /cart/{productId}` and the wishlist's move-to-cart path.

## Key elements

- **`postCart`** (exported) — The sole handler. Signature: `(request: Request<unknown, unknown, AddCartItemRequest>, response: Response) => void`.
  1. Reads `request.authContext!.id` for the user.
  2. Validates the body against the `AddCartItemBody` Zod schema via `parseBody`; short-circuits with 422 on failure.
  3. Calls `cartService.cartItemAdd(userId, productId, quantity, callerContextOf(request))`.
  4. On success, sends `createdOrOk` with a `Location: /cart/{productId}` header and an i18n-translated `"cart.product-added"` message.
  5. On service-level refusal, calls `refused` to emit the service-defined error status/body.
  6. On unexpected error, calls `catchAs(response, 'addCartItem')`.

## Relationships

- **`src/modules/cart/routes.ts`** — Imports and registers `postCart` on the Express router for `POST /cart`.
- **`src/modules/cart/services/index.ts`** — Provides `cartService.cartItemAdd`, the business-logic target of this controller.
- **`src/infrastructure/http/controller.ts`** — Supplies `parseBody`, `refused`, and `catchAs`, the shared request-validation and error-serialization helpers.
- **`src/infrastructure/http/request.ts`** — Supplies `callerContextOf`, which extracts locale/region metadata forwarded to the service.
- **`src/infrastructure/http/response.ts`** — Supplies `createdOrOk`, the helper that writes 201/200 with a `Location` header and JSON body.
- **`src/infrastructure/i18n/index.ts`** (and its `context.ts`) — Supplies the `t` translation function used for the success message.
- **`src/types/index.ts`** — Defines `CartResponse` and `AddCartItemRequest` used in type positions.

## Notes

- The 201-vs-200 distinction is driven by `result.status` from the service, not by a local check. Do not add a "did the line already exist?" check here.
- `request.authContext` is asserted non-null (`!`). The auth middleware is expected to run before this handler; there is no guard in this file.
- `parseBody` already rejects unknown/foreign `productId` values with 422, so no additional ID validation is needed downstream.
- The `Location` header always points to `/cart/{productId}` regardless of whether the response is 201 or 200.
