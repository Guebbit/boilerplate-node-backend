---
source: src/modules/delivery/routes.ts
sha256: 2877b528464f7a1daafd336b718f60c6f3437f1d82ba04ed13caaeb02b1adba9
generated_at: 2026-10-29T03:36:57.871653+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/routes.ts

## Purpose

Defines the Express route table for the delivery module. Each route wires a controller to the appropriate chain of authorization, idempotency, and cache-control middleware, encoding the access policy per endpoint (public, customer-scoped, staff-only).

## Key elements

- **`router`** (exported) — Express `Router` instance; mounted by `src/modules/delivery/module.ts`.
- **`GET /methods`** — Public; no auth. Calls `getShippingMethods`.
- **`GET /fulfillment-orders`** — Authenticated, `read:Order`. Calls `getPreorderFulfillmentOrders`.
- **`GET /fulfillment-orders/summary`** — Same guards. Calls `getPreorderSummary`.
- **`GET /fulfillment-orders/release-date-impact`** — Requires *both* `update:Product` and `display:Order`; `noStore` cache header. Calls `getReleaseDateImpact`.
- **`GET /fulfillment-orders/restock-date-impact`** — Same dual-permission + `noStore`. Calls `getRestockDateImpact`.
- **`GET /fulfillment-orders/:id`** — `read:Order`. Calls `getFulfillmentOrder`.
- **`POST /fulfillment-orders/:id/shipments`** — `update:Shipment` + `idempotencyKey`. Calls `postShipFulfillmentOrder`.
- **`POST /fulfillment-orders/:id/fulfill`** — Same guards as ship. Calls `postFulfillFulfillmentOrder`.
- **`POST /fulfillment-orders/:id/hold`** / **`/release`** — `update:Shipment`. Calls `postHoldFulfillmentOrder` / `postReleaseFulfillmentOrder`.
- **`GET /shipments/:id`** — `read:Order`. Calls `getShipment`.
- **`PATCH /shipments/:id`** — `update:Shipment`. Calls `patchShipment` (RFC 7396 merge patch).
- **`POST /shipments/:id/deliver`** / **`/lost`** — `update:Shipment`. Calls `postDeliverShipment` / `postMarkShipmentLost`.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — Provides `getAuth`, `isAuth`, `requirePermission`; applied as the first three middleware on every authenticated route.
- **`src/infrastructure/http/middlewares/idempotency.ts`** — Provides `idempotencyKey`; applied to the two destructive POST routes (ship, fulfill) so a retry cannot duplicate a parcel.
- **`src/infrastructure/http/middlewares/cache.ts`** — Provides `noStore`; applied to the two date-impact routes to prevent stale preview numbers.
- **`src/modules/delivery/module.ts`** — Imports the `router` export and mounts it (presumably under a `/delivery` prefix).
- **All controller files** (listed in graph neighbors) — Each is the terminal handler for exactly one route defined here.

## Notes

- **Route order is load-bearing.** The literal paths (`/summary`, `/release-date-impact`, `/restock-date-impact`) must stay *before* `GET /fulfillment-orders/:id`; otherwise Express treats them as id parameters and the controllers 404.
- **`idempotencyKey` sits after `requirePermission`.** A 401/403 response must never be recorded as the idempotency "answer," or a legitimate retry would replay the auth failure.
- **Date-impact routes use a compound guard** (`update:Product` **and** `display:Order`)—an editor who can move a product date but lacks order-visibility is intentionally excluded.
- **`GET /methods` is the sole unauthenticated route** in the file; every other route requires `getAuth` + `isAuth`.
- See `docs/modules/delivery.md` (referenced in the module docstring) for the broader product rationale behind the permission model.
