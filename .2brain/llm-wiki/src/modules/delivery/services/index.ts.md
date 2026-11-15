---
source: src/modules/delivery/services/index.ts
sha256: dde41b71361dfdbac09a0b63431d177a1d4c5c4af785d515f7715be28ed09cf3
generated_at: 2026-11-14T19:46:56.606024+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/index.ts

## Purpose

Aggregation facade for the delivery service layer. It imports every operation (reads, state-changing acts, administrative utilities) from the individual flow files in `src/modules/delivery/services/` and bundles them into a single `deliveryService` object that controllers and cross-module consumers call. This keeps the import surface to one name per module rather than scattering imports across a dozen siblings.

## Key elements

- **`deliveryService`** (const object) — The single exported facade. Groups all reads (`listMethods`, `listFulfillmentOrdersForOrder`, `getShipment`, `getFulfillmentOrder`, `shippedQuantities`, `remainderOptions`, `findShipmentsForOrders`, `findFulfillmentOrdersForOrders`), acts (`shipFulfillmentOrder`, `deliverShipment`, `markShipmentLost`, `reopenForReplacement`, `fulfillFulfillmentOrder`, `holdFulfillmentOrder`, `releaseFulfillmentOrder`), lifecycle ops (`ensureFulfillmentOrders`, `processOrder`, `cancelRemainder`, `cancelAllForOrder`), sync/admin (`syncWithOverride`, `splitForAllocation`, `releaseAllocated`, `onDateChanged`, `runPreorderSweep`, `previewDateImpact`), retention (`scrubHoldNotes`, `scrubLostNotes`, `scrubDestinations`, `reencryptShipments`), reporting (`deliveryDigest`, `listPreorderFulfillmentOrders`, `summarizePreorders`), tracking (`editShipmentTracking`), and notifications (`mailShipped`, `mailDelivered`, `mailLost`, `mailDelayed`, `mailHoldNoticed`).
- **Re-exported types** — `RemainderOption`, `ShipInput`, `LostInput`, `HoldInput`, `RemainderCancel`, `Split`, `PreorderSweepResult`, `BoardQuery` for consumers that need the input/shape contracts without importing the leaf files.
- **`ActRefusal`** — Error type from `./act`, re-exported for callers that need to catch specific act failures.

## Relationships

- **Controllers** (`get-fulfillment-order`, `get-shipment`, `get-shipping-methods`, `get-order-fulfillment-lists`, `get-preorder-fulfillment-orders`, `get-date-impact`, `patch-shipment`, `post-ship-fulfillment-order`, `post-deliver-shipment`, `post-mark-shipment-lost`, `post-fulfill-fulfillment-order`, `post-hold-fulfillment-order`, `post-process-order`) — Each controller imports specific members of `deliveryService` and delegates the business logic to this file's facade. This file is their sole service-layer entry point.
- **`src/modules/delivery/index.ts`** — The module's public barrel; it re-exports `deliveryService` (and the types) upward so other modules can reach the delivery service without knowing the internal layout.
- **`src/modules/account/tests/contract/shop.contract.test.ts`** — Cross-module contract test that exercises the delivery service surface (likely via `deliveryService` methods) to verify shop-level invariants around fulfillment.

## Notes

- The file is purely declarative: it contains no logic of its own. All behavior lives in the imported sibling files (`./ship`, `./deliver`, `./lost`, etc.). Changes to a flow's signature mean editing that sibling, not this index.
- `orderIdOfFulfillmentOrder` and `shippedQuantities` are thin reads exposed alongside the heavier acts; they exist so callers can derive order context or quantity state without importing `./read` directly.
- The comment block references `docs/theory/layers.md` for the "one file per flow, not one big file" convention.
- `ActRefusal` is the only class-level export; everything else is a function or type.
