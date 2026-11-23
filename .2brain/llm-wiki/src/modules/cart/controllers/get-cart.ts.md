---
source: src/modules/cart/controllers/get-cart.ts
source_sha256: 39c7c8772c2809ffd95568dde41e13c1fa9caebb57b37d40e11ddea1dbe29acf
context_sha256: 942e814761bd6ed473adef161d4e68172a24d5e8968b273858507fad0a4ab15a
generated_at: 2026-11-22T04:30:34.277638+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/controllers/get-cart.ts

## Purpose
Controller for `GET /cart`. It is a thin HTTP adapter that fetches the current user's cart through `cartService.getForView` and sends it back as a success response. Authentication is expected to be enforced before the route is reached.

## Key elements
- `getCart(request, response)`: Express handler. It calls `cartService.getForView(request.authContext!.id, callerContextOf(request))`. On success it calls `successResponse<CartResponse>(response, cart)`. On failure it calls `catchAs(response, 'getCart')`.

## Relationships
- `src/modules/cart/services/index.ts`: supplies `cartService`, which holds the actual cart logic.
- `src/infrastructure/http/response.ts`: supplies `successResponse`, which formats the success reply.
- `src/infrastructure/http/controller.ts`: supplies `catchAs`, the shared error handler. It is given the response and the label `'getCart'`.
- `src/infrastructure/http/request.ts`: supplies `callerContextOf`, which builds the caller context from the request and passes it to the service.
- `src/types/index.ts`: supplies the `CartResponse` type (imported as `@types`), used as the generic parameter of `successResponse`.
- `src/modules/cart/routes.ts`: the routing layer that mounts this handler. The handler itself only states that auth runs before the route.

## Notes
- The handler uses a non-null assertion (`request.authContext!.id`). It depends on upstream authentication middleware having set `authContext`, and it does no check of its own.
- It returns the promise chain rather than using `async`/`await`. Errors are handled by `.catch(catchAs(...))`, not by `try`/`catch`.
