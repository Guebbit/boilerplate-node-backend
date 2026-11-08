---
source: src/modules/delivery/routes.ts
sha256: 5c25319d5cd64fa76f05c1545959449b7f88a8187b87f31156bfb455919b3e47
generated_at: 2026-11-08T05:32:58.356149+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/routes.ts

## Purpose

Defines the Express route table for the delivery module. It wires each HTTP method/path to its controller function and applies the correct middleware chain (auth, permissions, idempotency, caching) per route. The permission model is split by intent: shipping-method lookup is public, fulfillment reads require `read:Order`, and all mutations require `update:Shipment`.

## Key elements

- **`router`** (exported) — the Express `Router` instance that `module.ts` mounts under the delivery prefix.
- **GET `/methods`** — public; delegates to `getShippingMethods`.
- **GET `/fulfillment-orders`** and **`/fulfillment-orders/summary`** — `read:Order`; delegate to `getPreorderFulfillmentOrders` / `getPreorderSummary`.
- **GET `/fulfillment-orders/release-date-impact`** and **`/restock-date-impact`** — `update:Product` + `display:Order` + `noStore`; delegate to `getReleaseDateImpact` / `getRestockDateImpact`.
- **GET `/fulfillment-orders/:id`** — `read:Order`; delegates to `getFulfillmentOrder`.
- **POST `/fulfillment-orders/:id/shipments`** — `update:Shipment` + `idempotencyKey`; delegates to `postShipFulfillmentOrder`.
- **POST `/fulfillment-orders/:id/fulfill`** — `update:Shipment` + `idempotencyKey`; delegates to `postFulfillFulfillmentOrder`.
- **POST `/fulfillment-orders/:id/hold`** and **`/release`** — `update:Shipment`; delegate to `postHoldFulfillmentOrder` / `postReleaseFulfillmentOrder`.
- **GET `/shipments/:id`** — `read:Order`; delegates to `getShipment`.
- **PATCH `/shipments/:id`** — `update:Shipment`; delegates to `patchShipment` (RFC 7396 merge).
- **POST `/shipments/:id/deliver`** — `update:Shipment`; delegates to `postDeliverShipment`.
- **POST `/shipments/:id/lost`** — `update:Shipment`; delegates to `postMarkShipmentLost`.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — provides `getAuth`, `isAuth`, and `requirePermission`; applied to every non-public route.
- **`src/infrastructure/http/middlewares/idempotency.ts`** — provides `idempotencyKey`; applied to the two "cut a shipment" POST routes (`ship` and `fulfill`) to prevent duplicate parcels on retry.
- **`src/infrastructure/http/middlewares/cache.ts`** — provides `noStore`; applied to the two date-impact GET routes so the preview is never served from cache.
- **`src/modules/delivery/controllers/*`** — each imported function is the terminal handler for exactly one route in this file.
- **`src/modules/delivery/module.ts`** — mounts the exported `router` into the application's route tree (the file's only consumer of this module's export).

## Notes

- **Route order is load-bearing.** The literal paths `summary`, `release-date-impact`, and `restock-date-impact` are registered *before* `/fulfillment-orders/:id`; if reordered, Express would match the parameter route and treat those literals as an `id`.
- **Idempotency placement.** `idempotencyKey` sits *after* `requirePermission` so that 401/403 responses are never recorded as the idempotent answer. Only `ship` and `fulfill` use it; `hold`/`release` are idempotent by nature and omit the key.
- **No step-up auth.** The file comments make clear that shipping, fulfilling, delivering, and marking lost are treated as ordinary staff actions under `update:Shipment` — there is no additional elevation beyond the permission check.
- **`noStore` is scoped to impact previews only.** The other GET routes rely on default caching behavior (or controller-level headers).
