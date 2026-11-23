---
source: src/modules/delivery/services/lost.ts
generated_at: 2026-11-22T04:55:47.122826+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/services/lost.ts

## Purpose
Implements the staff action "report a shipment lost or damaged in transit". In a single transaction it marks the shipment `lost`, reopens its units on the same fulfillment order (no new order, invoice or revenue), tops up the stock hold, creates a new on-hold fulfillment order for whatever stock cannot cover, steps the order back to `processing`, and announces `shipment.lost`.

## Key elements
- `LostInput` — request payload: `reason` (`ShipmentLostReason`), optional `note` (colleagues only, never mailed) and optional `message` (mailed to the buyer and shown on their order).
- `Lost` (internal) — `{ shipment, order }` returned by a committed act.
- `refuseNotLosable` — shared 409 refusal (`DELIVERY_NOT_LOSABLE`, `delivery.not-losable`).
- `lostAct` — the transactional body:
  1. Loads shipment, order and origin fulfillment order, refusing with "missing" if any is absent.
  2. Refuses unless the shipment is `shipped`, physical, and the order status passes `canRecordArrival`.
  3. Calls `shipmentRepository.markLost`.
  4. Calls `orderService.topUpStock` for the shipment's lines. Quantities with `owed > 0` become the owed set.
  5. Rebuilds the origin order's lines with `withLoss` and claims it via optimistic `revision` check, recomputing status with `statusOfLines`.
  6. If anything is owed, computes a promise (`promiseFor`) and creates an owed fulfillment order linked by `sourceShipmentId`.
  7. Calls `reportProgress`, then `orderService.reopenForFulfillment`, then `announceLost`.
- `markShipmentLost` — the exported entry point. Runs `lostAct` through `runAct`, then records an audit entry, refreshes the shelf, re-reads the order and returns the shipment view as a success response, or the refusal.

## Relationships
- `src/modules/delivery/services/act.ts` — supplies `runAct` (transaction wrapper) and `refuse` / `refuseMissing`.
- `src/modules/delivery/services/owed.ts` — `promiseFor` and `createOwedFulfillmentOrder` for the shortfall.
- `src/modules/delivery/services/announce.ts` — `announceLost` emits the notification/event.
- `src/modules/delivery/services/progress.ts` — `reportProgress` is called inside the transaction.
- `src/modules/delivery/services/found.ts` — `viewShipmentOf` builds the returned shipment view.
- `src/modules/delivery/domain/index.ts` — exposes the pure helpers `withLoss`, `statusOfLines`, and the `ProductQuantity` type, drawn from the domain files (`fulfillment.ts`, `lost.ts`).
- `src/modules/delivery/repository.ts` — `shipmentRepository` (`findInSession`, `markLost`) and `fulfillmentOrderRepository` (`findInSession`, `claim`).
- `src/modules/delivery/model.ts` — `ShipmentDocument` type.
- `src/modules/delivery/audit.ts` — `deliveryAuditActions.ADMIN_SHIPMENT_LOST`.
- `src/infrastructure/observability/audit.ts` — `recordAudit`.
- `src/infrastructure/http/response.ts` — `generateSuccess`, `ResponseSuccess`, `ResponseReject`.
- `@modules/orders` (outside the listed neighbors) — `orderService` (`readOrder`, `topUpStock`, `reopenForFulfillment`, `refreshShelf`, `getById`) and `canRecordArrival`.

## Notes
- Only `shipped` physical shipments on orders where `canRecordArrival` holds can be reported. All such failures share one 409 code.
- The origin-order `claim` uses its `revision`, so a concurrent change surfaces as the same `DELIVERY_NOT_LOSABLE` refusal.
- The audit entry is written only after the transaction commits, and its metadata holds only `shipmentId` and `reason`. The free-text `note` is deliberately kept out of the operator log.
- Shelf refresh and the fresh order read happen after the commit, outside the transaction. If the fresh read returns nothing, the order from the act is used.
