---
source: src/modules/delivery/services/index.ts
sha256: b579fdc59b308f62e001c4cdd99a4ebdc67deaf9f6a04d0a7c8ebb6e6ff684d8
generated_at: 2026-10-15T10:28:05.413354+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/index.ts

## Purpose

Barrel file that aggregates every public export from the delivery service layer and exposes a single `deliveryService` object. It exists so that controllers import one handle rather than reaching into a dozen sibling files, and so the module's public surface stays in one place. The doc comment notes the folder was split out of a single >1 000-line file (see `docs/theory/layers.md`).

## Key elements

- **`deliveryService`** (const) — The single service handle consumed by all delivery controllers. Exposes `listMethods`, `getForOrder`, `startFulfilment`, `shipFulfillmentOrder`, `deliverShipment`, `fulfillFulfillmentOrder`, `holdFulfillmentOrder`, `releaseFulfillmentOrder`, `editShipmentTracking`, `confirmWait`.
- **Re-exports from `./start`** — `listMethods`, `startFulfilment`.
- **Re-exports from `./read`** — `getForOrder`, `shippedQuantities`, `remainderOptions`, `waitHasExpired`, `findShipmentsForOrders`, `findFulfillmentOrdersForOrders`, and the `RemainderOption` type.
- **Re-exports from `./ensure`** — `ensureFulfillmentOrders`.
- **Re-exports from `./ship`** — `shipFulfillmentOrder`, `ShipInput` type.
- **Re-exports from `./deliver`** — `deliverShipment`, `DeliverInput` type.
- **Re-exports from `./fulfill`** — `fulfillFulfillmentOrder`.
- **Re-exports from `./holds`** — `holdFulfillmentOrder`, `releaseFulfillmentOrder`, `HoldInput` type.
- **Re-exports from `./tracking`** — `editShipmentTracking`.
- **Re-exports from `./confirm-wait`** — `confirmWait`.
- **Re-exports from `./cancel-remainder`** — `cancelRemainder`, `cancelAllForOrder`, `RemainderCancel` type.
- **Re-exports from `./override-sync`** — `syncWithOverride`.
- **Re-exports from `./act`** — `ActRefusal` (error type for transaction refusals).
- **Re-exports from `./split`** — `splitForAllocation`, `Split` type.
- **Re-exports from `./release-allocated`** — `releaseAllocated`.
- **Re-exports from `./slip`** — `onReleaseDateChanged`.
- **Re-exports from `./preorder-sweep`** — `runPreorderSweep`, `PreorderSweepResult` type.
- **Re-exports from `./board`** — `listPreorderFulfillmentOrders`, `summarizePreorders`, `BoardQuery` type.
- **Re-exports from `./retention`** — `scrubHoldNotes`.

## Relationships

- **All delivery controllers** (`post-ship-fulfillment-order`, `post-deliver-shipment`, `post-fulfill-fulfillment-order`, `post-hold-fulfillment-order`, `post-start-order`, `get-order-fulfillment`, `get-shipping-methods`, `get-preorder-fulfillment-orders`, `patch-shipment`, `post-confirm-wait`) import `deliveryService` (or individual re-exports) from this file to perform their operations.
- **`src/modules/delivery/index.ts`** — Module-level entry that re-exports or wires up this service surface.
- **`src/modules/delivery/module.ts`** — Module registration; references the service layer as the implementation behind the controllers.
- **`src/modules/delivery/services/act.ts`** — Transaction core (`ActRefusal` is re-exported here); per the doc comment every "act" runs as one transaction through this file.
- **`src/modules/delivery/services/board.ts`** — Preorder board queries re-exported through this barrel.
- **`src/modules/delivery/services/cancel-remainder.ts`** — Remainder cancellation logic re-exported here.

## Notes

- Functions *not* in `deliveryService` (e.g. `cancelRemainder`, `ensureFulfillmentOrders`, `runPreorderSweep`, `scrubHoldNotes`, `syncWithOverride`, `splitForAllocation`, `releaseAllocated`, `onReleaseDateChanged`) are still re-exported for use by other modules or internal callers, but controllers should prefer the `deliveryService` handle for the ten listed operations.
- The file both **imports** from `./start`, `./read`, `./ship`, `./deliver`, `./fulfill`, `./holds`, `./tracking`, `./confirm-wait` (for the `deliveryService` object) and **re-exports** from a broader set of files. If you add a new service file, you must both re-export it here *and* decide whether it belongs in `deliveryService`.
- The doc comment states each "act" is a single transaction defined in `act.ts`; the per-action files (`ship`, `deliver`, `fulfill`, `holds`) are orchestration wrappers around that transaction, not independent writes.
