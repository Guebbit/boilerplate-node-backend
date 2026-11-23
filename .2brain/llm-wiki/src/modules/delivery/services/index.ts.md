---
source: src/modules/delivery/services/index.ts
source_sha256: 113b70e88813b28462feb132dc8ed4100d15885561a0dca2a9d7861f418417a7
context_sha256: eec86a583c60b5afc6e3a381d907e28243dccaea8341d912719b035f0c1eb053
generated_at: 2026-11-22T04:55:28.446061+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/services/index.ts

## Purpose
Barrel file for the delivery module's service layer. It imports the operations from one-file-per-flow modules (`process`, `read`, `ship`, `deliver`, and others) and exposes them through a single `deliveryService` object. Controllers and sibling modules use that object as the module's one door. It also re-exports a few input/result types and `ActRefusal`.

## Key elements
- **`deliveryService`**: the exported object. It groups the operations below by area:
  - **Reads**: `listMethods`, `listFulfillmentOrdersForOrder`, `listShipmentsForOrder`, `getShipment`, `getFulfillmentOrder`, `orderIdOfFulfillmentOrder`, `shippedQuantities`, `remainderOptions`, `findShipmentsForOrders`, `findFulfillmentOrdersForOrders`, `deliveryDigest`.
  - **Order processing and creation**: `processOrder`, `ensureFulfillmentOrders`.
  - **Acts on fulfillment orders and shipments**: `shipFulfillmentOrder`, `deliverShipment`, `markShipmentLost`, `reopenForReplacement`, `fulfillFulfillmentOrder`, `holdFulfillmentOrder`, `releaseFulfillmentOrder`, `editShipmentTracking`, `cancelRemainder`, `cancelAllForOrder`.
  - **Allocation, override and date handling**: `syncWithOverride`, `splitForAllocation`, `releaseAllocated`, `onDateChanged`.
  - **Preorders**: `runPreorderSweep`, `listPreorderFulfillmentOrders`, `summarizePreorders`, `previewDateImpact`.
  - **Retention and encryption**: `scrubHoldNotes`, `scrubLostNotes`, `scrubDestinations`, `reencryptShipments`.
  - **Email notifications**: `mailShipped`, `mailDelivered`, `mailLost`, `mailDelayed`, `mailHoldNoticed`.
- **Type re-exports**: `RemainderOption`, `ShipInput`, `LostInput`, `HoldInput`, `RemainderCancel`, `Split`, `PreorderSweepResult`, `BoardQuery`.
- **`ActRefusal`**: re-exported from `./act`.

## Relationships
- The delivery controllers listed as neighbors import `deliveryService` from here. They cover date impact, fulfillment orders and order fulfillment lists, preorder fulfillment orders, shipments, shipping methods, deliver, fulfill, hold, mark-lost, process-order and ship.
- `src/modules/delivery/index.ts` is the module's public entry point and sits in the same dependency graph as this file.
- `src/modules/account/tests/contract/shop.contract.test.ts` is related through the dependency graph. The file content doesn't show how it uses this one.

## Notes
- The header comment says every act (`ship`, `deliver`, `lost`, `reship`, `fulfill`, `holds`, `cancel-remainder`) runs as one transaction in `act.ts`. That transaction writes the fulfillment records, the order's summary, any status move and the events together.
- Per the same comment, `read.ts` handles reads, `ensure.ts` creates fulfillment orders, and `override-sync.ts` keeps them in step with an admin override.
- The file contains no logic of its own. To add an operation, implement it in its own flow file, import it here, and add it to `deliveryService`.
