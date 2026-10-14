---
source: src/modules/delivery/routes.ts
sha256: c32521f1e84907a701a3735b6c4e58827cee17da61427ac6384b85fdc4605a39
generated_at: 2026-10-14T15:25:42.004894+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/routes.ts

## Purpose

Defines the Express `Router` for the delivery module, mapping every delivery endpoint to its controller and attaching the correct authorization guard per route. Guards range from fully public (shipping-methods lookup) through buyer-scoped reads to staff-permission writes, with two routes that additionally require a step-up re-authentication when the `forced` override flag is present.

## Key elements

- **`router`** (exported `Router`) — the single public entry point; `module.ts` mounts it.
- **`isForcedRequest(request)`** (local helper) — returns `true` when `request.body.forced === true`. Passed as the predicate to `requireFreshAuthWhen` on the ship and deliver routes.
- **Route definitions** (12 total):

  | Path & Method | Controller | Guard level |
  |---|---|---|
  | `GET /methods` | `getShippingMethods` | public |
  | `GET /order/:orderId` | `getOrderFulfillment` | `getAuth` + `isAuth` |
  | `GET /fulfillment-orders` | `getPreorderFulfillmentOrders` | + `requirePermission('orders.any.read')` |
  | `GET /fulfillment-orders/summary` | `getPreorderSummary` | + `requirePermission('orders.any.read')` |
  | `POST /order/:orderId/start` | `postStartOrder` | + `requirePermission('delivery.any.start')` |
  | `POST /fulfillment-orders/:id/shipments` | `postShipFulfillmentOrder` | + `requirePermission('delivery.any.update')` + `requireFreshAuthWhen(isForcedRequest, 'critical')` |
  | `POST /fulfillment-orders/:id/fulfill` | `postFulfillFulfillmentOrder` | + `requirePermission('delivery.any.update')` |
  | `POST /fulfillment-orders/:id/hold` / `/release` | `postHoldFulfillmentOrder` / `postReleaseFulfillmentOrder` | + `requirePermission('delivery.any.update')` |
  | `POST /fulfillment-orders/:id/confirm-wait` | `postConfirmWait` | `getAuth` + `isAuth` only |
  | `PATCH /shipments/:id` | `patchShipment` | + `requirePermission('delivery.any.update')` |
  | `POST /shipments/:id/deliver` | `postDeliverShipment` | + `requirePermission('delivery.any.update')` + `requireFreshAuthWhen(isForcedRequest, 'critical')` |

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — supplies all four guard functions (`getAuth`, `isAuth`, `requirePermission`, `requireFreshAuthWhen`) that are composed onto each route.
- **Controllers (10 files)** — each imported function is the terminal handler for exactly one (or two, for hold/release) route. This file contains no business logic; it is pure wiring.
- **`src/modules/delivery/module.ts`** — consumer of the exported `router`; mounts it into the application's middleware chain.
- **`src/modules/delivery/tests/unit/routes.test.ts`** — unit-tests the route table (paths, methods, guard ordering).
- **`tests/cross-cutting/step-up-auth-routes.test.ts`** — verifies the `requireFreshAuthWhen` + `isForcedRequest` interaction on the ship and deliver routes.

## Notes

- **Step-up auth is route-mounted, not service-mounted.** `requireFreshAuthWhen` must sit on the route because the service's internal `orders.any.override` check (`refuseUnearnedForce` in `service.ts`) can reject a request but cannot *challenge* the client for a re-auth before the controller runs. The two `forced` routes (ship, deliver) are the only ones that carry this guard.
- **`isForcedRequest` reads `request.body.forced`**, not a query parameter or header. A caller who omits the field (or sends `false`) never triggers the step-up prompt.
- **`confirm-wait` is the sole write route without `requirePermission`.** It is buyer-scoped by design; ownership enforcement lives in the service layer, not the route guard.
- **`/fulfill` (digital) has no `forced` variant** — there is no `processing`-only gate to bypass, and a physical fulfillment order cannot use this endpoint at all. Adding a step-up guard there would be dead code.
- **`PATCH /shipments/:id` follows RFC 7396 (JSON Merge Patch)** semantics for correcting a tracking code; it is not a full-replace `PUT`.
