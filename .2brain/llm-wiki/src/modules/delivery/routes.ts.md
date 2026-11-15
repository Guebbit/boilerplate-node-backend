---
source: src/modules/delivery/routes.ts
sha256: 359fe84d4fa1773776a0002518e59a08fa3af28d1bf49568003dad9f6f6b32fd
generated_at: 2026-11-14T19:43:04.882809+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/routes.ts

## Purpose

Defines the Express route table for the delivery module. It maps HTTP paths to controllers, attaching the appropriate authentication, permission, idempotency, and cache middleware per route. The guard strategy is tiered: shipping-methods lookups are public, fulfillment reads require `read:Order`, and every write requires `update:Shipment`.

## Key elements

- **`router`** (exported `Router`) — the single exported Express router for all delivery endpoints.
- **Public read** — `GET /methods` → `getShippingMethods`; no auth.
- **Fulfillment-order reads** — `GET /fulfillment-orders`, `/summary`, `/:id` → `getPreorderFulfillmentOrders`, `getPreorderSummary`, `getFulfillmentOrder`; guarded by `getAuth`, `isAuth`, `requirePermission('read','Order')`.
- **Date-impact previews** — `GET /fulfillment-orders/release-date-impact` and `/restock-date-impact` → `getReleaseDateImpact`, `getRestockDateImpact`; require both `update:Product` and `display:Order`, plus `noStore`.
- **Ship** — `POST /fulfillment-orders/:id/shipments` → `postShipFulfillmentOrder`; `requireIdempotencyKey` (mandatory) placed *after* the permission check so a 401/403 is never cached as the idempotent answer.
- **Fulfill (digital)** — `POST /fulfillment-orders/:id/fulfill` → `postFulfillFulfillmentOrder`; `idempotencyKey` is optional (re-runs are refused by state, not by key).
- **Hold / Release** — `POST /fulfillment-orders/:id/hold|release` → `postHoldFulfillmentOrder`, `postReleaseFulfillmentOrder`.
- **Shipment reads & writes** — `GET /shipments/:id` → `getShipment`; `PATCH /shipments/:id` → `patchShipment` (RFC 7396 merge); `POST /shipments/:id/deliver` → `postDeliverShipment`; `POST /shipments/:id/mark-lost` → `postMarkShipmentLost`.

## Relationships

- **`src/modules/delivery/module.ts`** — mounts `router` onto the application's Express instance; this file is the route-level contract that module registers.
- **`src/kernel/middlewares/authorizations.ts`** — provides `getAuth`, `isAuth`, `requirePermission` used on every non-public route.
- **`src/infrastructure/http/middlewares/idempotency.ts`** — provides `requireIdempotencyKey` (ship) and `idempotencyKey` (fulfill); placed after the auth guard so unauthenticated requests never consume an idempotency slot.
- **`src/infrastructure/http/middlewares/cache.ts`** — provides `noStore`, applied only to the two date-impact GETs so a product-date change is never served stale.
- **Controllers** (`get-shipping-methods`, `get-fulfillment-order`, `get-preorder-fulfillment-orders`, `get-shipment`, `patch-shipment`, `post-deliver-shipment`, `post-fulfill-fulfillment-order`, `post-hold-fulfillment-order`, `post-mark-shipment-lost`, `post-ship-fulfillment-order`, `get-date-impact`) — each is the terminal handler for exactly one route declared here.

## Notes

- **Route ordering is significant.** The literal paths `/fulfillment-orders/summary`, `/release-date-impact`, and `/restock-date-impact` are registered *before* `/fulfillment-orders/:id`; swapping them would cause those literals to be captured as an `:id` and 404.
- **Idempotency is intentionally asymmetric.** Ship *requires* a key (a retry without one would cut a second parcel); fulfill *accepts* one optionally (state machine rejects re-runs with 409). Do not "unify" the two.
- **Permission scope.** Reads use `read:Order` and the controller narrows to the caller's own rows (404 for out-of-scope). `display:Order` widens the view to all orders. Write operations uniformly require `update:Shipment`—there is no step-up or separate `update:Order` gate at the route level.
- **`noStore` is not a blanket policy.** It appears only on the two impact-preview GETs; all other routes rely on default caching behaviour.
- See `docs/modules/delivery.md` (referenced in the file header) for the domain rationale behind the guard tiers.
