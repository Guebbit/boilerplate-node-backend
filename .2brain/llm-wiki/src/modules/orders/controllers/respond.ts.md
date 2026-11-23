---
source: src/modules/orders/controllers/respond.ts
source_sha256: 50760ccc57da3d7640a5cf9e88327c4af533cc98c6638a3a7a3607e887473bf8
context_sha256: f127700c5897d1024fbae13a3417a0e6090d3d85378cf7140869f841c495c1b3
generated_at: 2026-11-22T06:10:19.737276+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/controllers/respond.ts

## Purpose
Shared success tail for the order controllers. After the service returns an order document, this file hydrates it with the caller's `actions` and sends it as the response body. It is kept out of `src/modules/orders/services/scope.ts` so that `withActions` stays framework-free. Only the hydrate-then-send shape is shared. Each call site still chooses its own status (for example, create uses 201).

## Key elements
- **`respondWithOrder(response, order, authContext, context, status?)`** is the only export. It returns `Promise<void>`.
  - Calls `orderService.withActions(order, authContext)`.
  - Calls `answerAsResource(response, order, "/orders/<id>")` to set the order's real `ETag` and its resource location.
  - Calls `createdOrOk<Order>(response, resolved, status, "/orders/<id>")` to send the body. `status` defaults to 200, and a 201 always names the new order.
  - Ends with `.catch(catchAs(response, context))`.
- **`OrderForResponse`** is a private type alias. It is `Parameters<typeof orderService.withActions>[0]`, derived from the service rather than imported from `../model`.

## Relationships
- **`../services` (`orderService`)**: `withActions` does the hydration.
- **`@infrastructure/http/response`**: `createdOrOk` writes the status and body.
- **`@infrastructure/http/preconditions`**: `answerAsResource` sets the `ETag` and resource location.
- **`@infrastructure/http/controller`**: `catchAs` turns failures into error responses under the given operation name.
- **`@types`**: supplies the `AuthContext` and `Order` types.
- **Order controllers** (`get-order`, `post-order`, `post-cancel-order`, `post-order-override-status`, `put-billing-address`, `put-shipping-address`): these are the neighbors in the graph that share this success tail. Nothing in this file shows how each one calls it.

## Notes
- The `context` argument must match the operation name that the calling controller passes to its own final `.catch`. A `withActions` failure then logs under the same name as a service failure.
- The `ETag` and resource location come from the raw `order` document. The body is `resolved`, which is the wire shape.
- The type is derived instead of imported because controllers may not hold a persistence handle (`no-persistence-imports`).
- `authContext` may be `undefined`.
