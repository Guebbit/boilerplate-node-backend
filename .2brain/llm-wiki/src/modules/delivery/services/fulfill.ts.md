---
source: src/modules/delivery/services/fulfill.ts
source_sha256: e68eeaf0d0d64b16d2acbc3b1cf0b35eabc75270d5b4b61f7e1741a833a72e68
context_sha256: 4566edc010a1245c13a879d248b7a32b280f33f67238d26bbd3a96e0c936f6ca
generated_at: 2026-11-22T04:55:02.582607+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/services/fulfill.ts

## Purpose
Implements the "digital act": fulfilling a `digital` fulfillment order that has no parcel to carry. It cuts a tracking-less shipment that is created and delivered in the same write, and, when nothing else remains or is still out, completes the order in the same transaction. The order's withdrawal clock is counted from payment (digital content, Art. 9(2)(c)).

## Key elements
- `fulfillFulfillmentOrder(fulfillmentOrderId, authContext, context)` (exported): the public entry point. It returns `ResponseSuccess<Shipment>` with the already-delivered shipment, or a `ResponseReject` naming the refusal.
- `fulfillAct` (internal): the transactional body. Its steps run in this order:
  - Read the fulfillment order together with its order.
  - Check the preconditions.
  - Cut the shipment.
  - Start fulfillment.
  - Report progress.
  - Settle the order.
  - Announce shipped and delivered.
- `Fulfilled` (internal interface): `{ shipment, order }`, the result a committed act hands to the steps that follow.

Refusals, all with status 409 except the unearned-start case handled by `refuseUnearnedStart`:
- `ORDER_NOT_PROCESSING`: the order is not open for shipment.
- `DELIVERY_NOT_DIGITAL`: the fulfillment order's kind is not `digital`.
- `DELIVERY_NOT_SHIPPABLE`: `isFulfillable` is false.

## Relationships
- **`./act`**: `runAct` wraps the transaction and yields either a refusal or a value. `readWithOrder` and `refuse` are used inside `fulfillAct`.
- **`./cut`**: `cutShipment` creates the shipment. It is called with `delivered: true`, `forced: false`, `takeStock: true` and the remainder lines.
- **`./progress`**: `startFulfillment`, `reportProgress` and `settleOrder` move the order's state forward and complete it.
- **`./announce`**: `announceShipped` and `announceDelivered` emit both events for the one shipment.
- **`./ship-gate`**: `mayStartFulfillment`, `isOpenForShipment`, `refuseUnearnedStart` and `auditUnearnedStart` gate the `start:Shipment` permission and audit refused unearned starts.
- **`./actions`**: `viewShipment` builds the response, including the caller's `actions`.
- **`../domain`**: `isFulfillable` and `remainderLines`.
- **`../model`**: provides the `ShipmentDocument` type.
- **`../audit`**: provides the delivery audit action constants used for the success audit entry.
- **`@infrastructure/observability/audit`**: `recordAudit` writes the success audit entry.
- **`@infrastructure/http/response`**: `generateSuccess` and the response types.
- **`@modules/orders`** (`src/modules/orders/index.ts`): supplies the `OrderDocument` type and the order service used after the commit to refresh the shelf with the shipment's product ids.

## Notes
- `mayStart` is computed once, before the transaction opens, so a retried transaction cannot change the verdict.
- From `paid`, the act itself makes the `start` move (`startFulfillment`), and it does so before `reportProgress` and `settleOrder` read the state.
- The shelf refresh and the success audit run after the transaction, only on the success path. A refusal instead triggers `auditUnearnedStart` and returns the reject.
- Refusals are not thrown out to the caller. `refuse` is called inside the transaction and `runAct` surfaces it as `result.refused`.
