---
source: src/modules/cart/controllers/delete-cart-items.ts
source_sha256: c925bcec91379a22e98b9deb48b35d643f645c83b390f22a65794c7e008827ea
context_sha256: 942e814761bd6ed473adef161d4e68172a24d5e8968b273858507fad0a4ab15a
generated_at: 2026-11-22T04:30:24.498879+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/controllers/delete-cart-items.ts

## Purpose
Express controller for `DELETE /cart/items`. It is a thin HTTP adapter over `cartService.remove` that clears all items in the authenticated user's cart. The module doc says the route is bodyless and sits on the line collection's own URL, so the destructive operation must be requested explicitly. It also says a 415 guard refuses any body, so a body stripped in transit cannot turn a one-line delete into a clear-all.

## Key elements
- `clearCart(request, response)`: the only export.
  - Reads the user id from `request.authContext!.id`, using a non-null assertion that assumes auth middleware has already run.
  - Calls `cartService.remove(userId, callerContextOf(request))`.
  - On success, sends the returned cart with `successResponse<CartResponse>`.
  - On failure, `.catch(catchAs(response, 'clearCart'))` handles the error.
  - Returns the promise chain.

## Relationships
- `src/modules/cart/services/index.ts`: supplies `cartService`, whose `remove` does the deletion.
- `src/infrastructure/http/response.ts`: supplies `successResponse`, which formats the success response.
- `src/infrastructure/http/controller.ts`: supplies `catchAs`, the error handler labelled `'clearCart'`.
- `src/infrastructure/http/request.ts`: supplies `callerContextOf`, which builds the caller context passed to the service.
- `src/types/index.ts`: supplies the `CartResponse` type (imported as `@types`).
- `src/modules/cart/routes.ts`: presumably where this handler is mounted for `DELETE /cart/items`. The controller file itself does not show this wiring.

## Notes
- The controller calls `cartService.remove(userId, ...)` with only a user id and no item identifier. The handler's doc comment says it removes all items, and the module doc contrasts it with a one-line delete.
- The body-refusing 415 guard is described in the doc comment but not implemented here, so it must live elsewhere, probably in the route or middleware layer.
