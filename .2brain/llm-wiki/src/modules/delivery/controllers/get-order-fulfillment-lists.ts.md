---
source: src/modules/delivery/controllers/get-order-fulfillment-lists.ts
generated_at: 2026-11-22T04:45:39.385895+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/controllers/get-order-fulfillment-lists.ts

## Purpose
Express controllers for `GET /orders/:id/fulfillment-orders` and `GET /orders/:id/shipments`. Together they show where an order's goods stand: fulfillment orders (the plan) and shipments cut from them (what left). The order page's shipping panel reads both once the order is paid; before that both lists are empty. Each list is unpaged, since an order holds only a handful.

## Key elements
- `getOrderFulfillmentOrders(request, response)` — validates the order id, calls `deliveryService.listFulfillmentOrdersForOrder(id, request.authContext)`, and responds with `{ items: FulfillmentOrder[] }`.
- `getOrderShipments(request, response)` — same flow via `deliveryService.listShipmentsForOrder`, responding with `{ items: Shipment[] }`.

Both handlers follow the same sequence:
1. `requireId(request, response, { notFound: 'delivery.order-not-found' })`. If it yields no id, the handler returns `Promise.resolve()` and does nothing further.
2. Call the service with the id and `request.authContext`.
3. `refused(response, result)`. If the service refused, return without sending a success body.
4. Otherwise send `successResponse` with `{ items: result.data }`.
5. `.catch(catchAs(response, '<handlerName>'))` handles unexpected errors.

## Relationships
- `src/infrastructure/http/ids.ts` — `requireId` checks the `:id` param and is given the `delivery.order-not-found` not-found key.
- `src/infrastructure/http/controller.ts` — `refused` handles the response when the service result is a refusal. `catchAs` builds the error handler, labelled with the handler name.
- `src/infrastructure/http/response.ts` — `successResponse` sends the typed success payload.
- `src/modules/delivery/services/index.ts` — supplies `deliveryService`, which does the actual listing.
- `src/types/index.ts` — supplies the `FulfillmentOrder` and `Shipment` types used for the response payloads.
- `src/modules/delivery/order-routes.ts` — the routing layer for the two endpoints named in this file's header.

## Notes
- The handlers hold no business logic. Everything beyond id validation and response shaping is delegated to `deliveryService`.
- The responses use an `items` wrapper but carry no pagination.
