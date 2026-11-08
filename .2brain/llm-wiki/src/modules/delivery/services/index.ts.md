---
source: src/modules/delivery/services/index.ts
sha256: 3d3468a11bc0ff855e0c1fe6e55a48036cae537cd59ce414cffbf1957748e996
generated_at: 2026-11-08T05:36:19.444871+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/index.ts

## Purpose

Barrel/facade for the delivery service layer. It aggregates every operation (reads, writes, acts, notifications, retention, preorders) into a single `deliveryService` object so that controllers and sibling modules interact with the domain through one door instead of reaching into individual sub-files. The header docstring references `docs/theory/layers.md` for the layering rationale.

## Key elements

- **`deliveryService`** (const object) — the single public surface. Groups ~35 functions under one name, spanning:
  - *Reads:* `listMethods`, `listFulfillmentOrdersForOrder`, `listShipmentsForOrder`, `getShipment`, `getFulfillmentOrder`, `shippedQuantities`, `remainderOptions`, `findShipmentsForOrders`, `findFulfillmentOrdersForOrders`, `listPreorderFulfillmentOrders`, `summarizePreorders`.
  - *Acts (transactional writes):* `processOrder`, `shipFulfillmentOrder`, `deliverShipment`, `markShipmentLost`, `reopenForReplacement`, `fulfillFulfillmentOrder`, `holdFulfillmentOrder`, `releaseFulfillmentOrder`, `editShipmentTracking`, `cancelRemainder`, `cancelAllForOrder`, `ensureFulfillmentOrders`, `syncWithOverride`.
  - *Preorder / date logic:* `runPreorderSweep`, `previewDateImpact`, `onDateChanged`.
  - *Allocation:* `splitForAllocation`, `releaseAllocated`.
  - *Retention & security:* `scrubHoldNotes`, `scrubLostNotes`, `scrubDestinations`, `reencryptShipments`.
  - *Notifications:* `mailShipped`, `mailDelivered`, `mailLost`, `mailDelayed`, `mailHoldNoticed`.
  - *Digest:* `deliveryDigest`.
- **Re-exported types:** `RemainderOption`, `ShipInput`, `LostInput`, `HoldInput`, `RemainderCancel`, `Split`, `PreorderSweepResult`, `BoardQuery`.
- **`ActRefusal`** — exported error/rejection type from `./act`, used when a transactional act is refused.

## Relationships

- **Consumed by all delivery controllers** (`get-shipment`, `get-shipping-methods`, `post-deliver-shipment`, `post-ship-fulfillment-order`, `post-fulfill-fulfillment-order`, `post-hold-fulfillment-order`, `post-mark-shipment-lost`, `post-process-order`, `patch-shipment`, `get-date-impact`, `get-fulfillment-order`, `get-order-fulfillment-lists`, `get-preorder-fulfillment-orders`). Each controller calls the relevant method on `deliveryService` rather than importing sub-files directly.
- **Re-exported by `src/modules/delivery/index.ts`** — the module's public entry point, which exposes `deliveryService` (and the types) to the rest of the application.
- **Exercised by `src/modules/account/tests/contract/shop.contract.test.ts`** — contract tests drive `deliveryService` operations to verify cross-module invariants.

## Notes

- This file is purely a re-assembly point; no logic lives here. All behavior resides in the imported sub-files (`./ship`, `./deliver`, `./act`, etc.).
- The module is intentionally **not** split into a per-concern namespace—controllers import one object and pick methods. Adding a new operation means adding an import line and a key on `deliveryService`.
- `ActRefusal` is exported as a named value (not a type), suggesting it is a class or sentinel used in `catch`/`instanceof` checks by controllers.
