# src/modules/cart/controllers/delete-cart-all.ts

## Purpose

Thin HTTP adapter that maps `DELETE /cart/all` to `cartService.cartRemove`. It exists as a dedicated, bodyless destructive endpoint so that "clear everything" must be explicitly requested by URL rather than inferred from a missing body on `DELETE /cart` (a pattern that previously allowed a stripped body to silently wipe the cart).

## Key elements

- **`clearCart`** (exported const) — Express handler for `DELETE /cart/all`. Reads the authenticated user ID via `authContextOf`, calls `cartService.cartRemove(userId, callerContextOf(request))`, returns the resulting cart through `successResponse`, and funnels rejections into `catchAs(response, 'clearCart')`.
- **Module docblock** — documents the design rationale: separating the destructive spelling from the generic `DELETE /cart` route to prevent accidental full-cart deletion.

## Relationships

- **`src/modules/cart/routes.ts`** — registers `clearCart` as the handler for the `DELETE /cart/all` route.
- **`src/modules/cart/services/index.ts`** — provides the `cartService` instance whose `cartRemove` method performs the actual removal.
- **`src/infrastructure/http/request.ts`** — supplies `authContextOf` (extracts the authenticated user) and `callerContextOf` (propagates caller metadata into the service call).
- **`src/infrastructure/http/response.ts`** — supplies `successResponse` for the 200 reply.
- **`src/infrastructure/http/controller.ts`** — supplies `catchAs`, the standard promise-rejection → HTTP-error bridge used here.

## Notes

- The handler is intentionally **bodyless**; no `req.body` is read. If a client sends a body it is ignored.
- Error handling delegates entirely to `catchAs` with the label `'clearCart'`—there is no local try/catch or custom status mapping in this file.
- The function returns the promise chain (`.then`/`.catch`) rather than using `async/await`; the route layer must handle the returned promise or rely on Express 5's built-in async support.
