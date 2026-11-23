---
source: src/modules/delivery/routes.ts
source_sha256: fb9abea577f60b57bea8b765be88430591ed6df190996c4e5ada6863512e45f3
context_sha256: 710dc2316193c7e320eba3b562e1366bf40920f7e55d9d1f8027a819ba1fa531
generated_at: 2026-11-22T04:52:11.622327+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/routes.ts

## Purpose
Express route table for the delivery module. It maps HTTP paths under `/delivery` to controllers and chooses the guard chain per route. The shipping-methods list is public, reads need a signed-in caller, and every write is a staff action.

## Key elements
- `router`: the exported Express `Router`, with these routes:
  - `GET /methods`: public, wrapped in `environmentCache`, handled by `getShippingMethods`.
  - `GET /fulfillment-orders` and `GET /fulfillment-orders/summary`: preorder board reads (`getPreorderFulfillmentOrders`, `getPreorderSummary`). They need `read:Order`.
  - `GET /fulfillment-orders/release-date-impact` and `/restock-date-impact`: previews for the product form (`getReleaseDateImpact`, `getRestockDateImpact`). They need both `update:Product` and `display:Order`, and use `noStore`.
  - `GET /fulfillment-orders/:id`: one fulfillment order (`getFulfillmentOrder`), `read:Order`.
  - `POST /fulfillment-orders/:id/shipments`: cuts a shipment (`postShipFulfillmentOrder`). It needs `update:Shipment` and a required idempotency key.
  - `POST /fulfillment-orders/:id/fulfill`: the digital fulfillment door (`postFulfillFulfillmentOrder`). It needs `update:Shipment` and an optional idempotency key.
  - `POST /fulfillment-orders/:id/hold` and `/release`: `postHoldFulfillmentOrder` and `postReleaseFulfillmentOrder`, both `update:Shipment`.
  - `GET /shipments/:id`: `getShipment`, `read:Order`.
  - `PATCH /shipments/:id`: corrects a tracking code (RFC 7396) via `patchShipment`, `update:Shipment`.
  - `POST /shipments/:id/deliver`: `postDeliverShipment`, `update:Shipment`.
  - `POST /shipments/:id/mark-lost`: `postMarkShipmentLost`, `update:Shipment`.

## Relationships
- `@kernel/middlewares/authorizations` (`src/kernel/middlewares/authorizations.ts`) provides `getAuth`, `isAuth` and `requirePermission`. Every non-public route chains them.
- `@infrastructure/http/middlewares/idempotency` provides `idempotencyKey` (optional) and `requireIdempotencyKey({ operation, subjectParam })`. Only the ship route uses the required form, with `operation: 'ship'` and `subjectParam: 'id'`. The fulfill route uses the optional one.
- `@infrastructure/http/middlewares/cache` provides `environmentCache` (on `/methods`) and `noStore` (on the two date-impact previews).
- `./controllers/*`: each route delegates to one handler. Hold and release share `post-hold-fulfillment-order`. The two date-impact handlers share `get-date-impact`. The preorder list and summary handlers share `get-preorder-fulfillment-orders`.
- `src/modules/delivery/module.ts` is a graph neighbor, but `routes.ts` does not import it. This file only exports `router`.

## Notes
- **Route order matters.** `/fulfillment-orders/:id` is registered after the literal `summary`, `release-date-impact` and `restock-date-impact` paths, so those literals are not read as an id.
- **Idempotency placement.** On ship, `requireIdempotencyKey` comes after `requirePermission`, so a 401/403 is never stored as the answer. The key is required because a retry would otherwise cut a second parcel. Fulfill takes the whole remainder, so its key is optional and a re-run is refused with a 409 by the order's state.
- **Ownership scoping happens in services, not routes.** The `read:Order` routes only check the permission. Per the comments, the service narrows results to the caller's own orders unless they hold `display:Order`. For single-item reads it answers 404 for what the caller may not see.
- **Start-from-paid.** Ship and fulfill also need `start:Shipment` when the order is `paid`, since the act makes the start move itself. The service asks for this, not the route.
- **No step-up auth.** The comments state that ship, deliver and mark-lost need none.
- **Fulfill is digital only.** A physical fulfillment order cannot use `/fulfill`.
- **State effects (per the comments).** The order moves processing -> shipped only when nothing remains anywhere. The last delivery moves it shipped -> delivered. Marking a shipment lost reopens its units on the same fulfillment order, tops up the stock hold and notifies the buyer.
