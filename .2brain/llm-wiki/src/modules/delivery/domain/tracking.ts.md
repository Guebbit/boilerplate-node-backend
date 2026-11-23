---
source: src/modules/delivery/domain/tracking.ts
source_sha256: c3c1d9ca6dfd6986a6ba2ce650213071a249c807cf2f484e4bba4e4f7a09b907
context_sha256: 2e8ac7a0477bc0df25bae89ffbe51aeeae57f708583c118c95132761727a30d8
generated_at: 2026-11-22T04:49:22.755549+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/domain/tracking.ts

## Purpose
Defines the single rule for whether a shipment is still waiting for the carrier's tracking code. This rule backs the `Shipment.awaitingTracking` flag and the staff digest's "tracked, still without a code" row.

## Key elements
- `TrackingFacts` (interface): the shipment fields the rule reads.
  - `kind`: a `FulfillmentOrderKind`. `physical` means a parcel. A digital fulfillment never had a carrier.
  - `status`: a `ShipmentStatus`.
  - `trackingCode`: optional string.
- `isAwaitingTracking(shipment, shippingMethodId)`: returns `true` only when all of these hold:
  - `kind` is `physical`.
  - `status` is `shipped`.
  - `trackingCode` is empty or missing.
  - `shippingMethodId` is defined.
  - `findShippingMethod(shippingMethodId)?.tracked === true`.

## Relationships
- Imports `FulfillmentOrderKind` and `ShipmentStatus` from `@types` (`src/types/index.ts`).
- Imports `findShippingMethod` from `./rates` (`src/modules/delivery/domain/rates.ts`) to check whether the order's method is `tracked`.
- `src/modules/delivery/services/digest.ts` is named in this file's own docs as a consumer of the rule (the staff digest row).
- `src/modules/delivery/domain/index.ts`, `src/modules/delivery/services/actions.ts` and `src/modules/delivery/tests/unit/tracking.test.ts` are graph neighbors of this file.

## Notes
- The shipping method is looked up live, not frozen at checkout. A rate change can therefore change which shipments count as waiting.
- An unknown method id, or no method id, gives `false`, because the optional chaining yields `undefined`, which is not `=== true`.
- Any non-empty `trackingCode` makes the result `false`. An empty string counts as no code.
