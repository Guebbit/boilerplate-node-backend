---
source: src/modules/delivery/services/index.ts
sha256: df442ddcf07efef9ea0809352769a29f5fcc1a4e4e50bb4a1f0a9274a65e20f7
generated_at: 2026-10-29T03:40:38.736277+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/index.ts

## Purpose

Facade (barrel) for the entire delivery service layer. It re-exports every function, type, and the `ActRefusal` error from the per-flow submodules (`./ship`, `./deliver`, `./read`, `./ensure`, etc.) and bundles them into a single `deliveryService` object. No logic lives here; its only job is to give controllers and sibling modules one import path for all fulfillment-order and shipment operations.

## Key elements

- **`deliveryService`** — the single exported object. Contains ~35 functions grouped by concern: reads (`listFulfillmentOrdersForOrder`, `getShipment`, `shippedQuantities`, …), writes/acts (`shipFulfillmentOrder`, `deliverShipment`, `fulfillFulfillmentOrder`, `markShipmentLost`, `reopenForReplacement`, `holdFulfillmentOrder`, `releaseFulfillmentOrder`, `cancelRemainder`, `cancelAllForOrder`), order processing (`processOrder`, `listMethods`, `ensureFulfillmentOrders`), allocation (`splitForAllocation`, `releaseAllocated`), preorders (`runPreorderSweep`, `listPreorderFulfillmentOrders`, `summarizePreorders`), admin ops (`syncWithOverride`, `reencryptShipments`, `scrubHoldNotes`, `scrubLostNotes`, `scrubDestinations`), date/slip handling (`onDateChanged`, `previewDateImpact`), tracking (`editShipmentTracking`), notifications (`mailShipped`, `mailDelivered`, `mailLost`, `mailDelayed`, `mailHoldNoticed`), and diagnostics (`deliveryDigest`).
- **Re-exported types** — `RemainderOption`, `ShipInput`, `LostInput`, `HoldInput`, `RemainderCancel`, `Split`, `PreorderSweepResult`, `BoardQuery`. These are the input/shape contracts controllers pass into the service.
- **`ActRefusal`** (from `./act`) — the shared error class thrown when a fulfillment act cannot proceed (e.g. wrong state, insufficient quantity).

## Relationships

- **Consumed by every delivery controller** — `get-date-impact`, `get-fulfillment-order`, `get-order-fulfillment-lists`, `get-preorder-fulfillment-orders`, `get-shipment`, `get-shipping-methods`, `patch-shipment`, `post-deliver-shipment`, `post-fulfill-fulfillment-order`, `post-hold-fulfillment-order`, `post-mark-shipment-lost`, `post-process-order`, and `post-ship-fulfillment-order` all import `deliveryService` (or individual re-exports) from this file and call the corresponding methods.
- **`src/modules/delivery/index.ts`** — the module entry point that re-exports this service (and likely the router), making `deliveryService` reachable as `@modules/delivery`.
- **`src/modules/account/tests/contract/shop.contract.test.ts`** — an account-module contract test that exercises delivery operations (order processing, fulfillment) through this service to verify cross-module invariants.

## Notes

- Pure re-export file — there is no runtime logic here. If a function is missing from `deliveryService`, the fix is in the source submodule (e.g. `./ship.ts`), not here.
- The module doc-block references `docs/theory/layers.md` for the architectural rationale behind "one file per flow."
- Types are exported at the module level (`export type {…}`) rather than inside the `deliveryService` object, so consumers do `import type { ShipInput }` separately.
- `ActRefusal` is the only class-level export; all other exports are plain functions.
