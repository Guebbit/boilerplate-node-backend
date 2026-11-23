---
source: src/modules/delivery/services/deliver.ts
source_sha256: 6f1b9cbdcd44f34c2ab21b8161768269dbcc23df8d6ab176fd13025e8c6d9017
context_sha256: 4ea312ccf8bdba9c7eca443868559b1cf0c9095952735202faeb2aba080ab494
generated_at: 2026-11-22T04:53:57.563077+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/services/deliver.ts

## Purpose
Implements the "delivery door": staff recording that a shipment arrived. In one transaction it stamps the shipment as delivered, recomputes the order's summary and, if this was the last undelivered shipment with nothing left to ship, moves the order to `delivered` and starts its withdrawal clock from that arrival (CRD Art. 9(2)(b)(i)). It also accepts a `lost` shipment that turns up, provided every unit on it is still open.

## Key elements
- `deliverShipment(shipmentId, authContext, context)` — the exported entry point. Runs `deliverAct` via `runAct`, then on success records an audit entry and returns the shipment view. Returns `ResponseSuccess<Shipment>` or a `ResponseReject`.
- `deliverAct` (internal) — the transactional body:
  - Loads the shipment and its order, refusing with `delivery.shipment-not-found` or `delivery.order-not-found` if either is missing.
  - Refuses with 409 `DELIVERY_NOT_DELIVERABLE` unless `canRecordArrival(order.status)` allows it.
  - Takes a single `at` timestamp, used for both the shipment stamp and the withdrawal deadline.
  - Calls `restoreLostShipment` if the shipment was `lost`, otherwise marks the shipment delivered through the repository. A falsy result also gives the 409 refusal.
  - Then calls `reportProgress`, `settleOrder` (using `summary.lastDeliveredAt ?? at`) and `announceDelivered`.
- `Delivered` (internal interface) — result of the act: `shipment`, `order`, and `wasLost`.

## Relationships
- `./act` — supplies `runAct` (transaction and refusal handling), `refuse` and `refuseMissing`.
- `./found` — `restoreLostShipment` handles the lost-shipment path; `viewShipmentOf` builds the response view.
- `./progress` — `reportProgress` recomputes the order summary; `settleOrder` finalizes the order using the last-delivery time.
- `./announce` — `announceDelivered` is called within the transaction after the order is settled.
- `../repository` — `shipmentRepository` loads the shipment inside the session and marks it delivered.
- `../model` — `ShipmentDocument` type.
- `../audit` — supplies `deliveryAuditActions` for the audit entry's action.
- `@modules/orders` — `orderService` reads the order and refreshes the shelf, `canRecordArrival` is the lifecycle guard, and `OrderDocument` is the order type.
- `@infrastructure/http/response` — `generateSuccess`, `ResponseSuccess`, `ResponseReject`.
- `@infrastructure/observability/audit` — `recordAudit`.

## Notes
- Audit and shelf refresh happen after the transaction commits, not inside it. The audit entry targets the order (`targetType: 'order'`) and adds `wasLost: true` to its metadata only for restored shipments.
- The shelf refresh runs only for restored lost shipments. The code comment says a restore moved the stock hold, so the availability entry follows the commit.
- `canRecordArrival` rejects `delivered` and `canceled` orders.
- `authContext` is used only for the response's `actions`. `context` is used for the audit entry and for the caller id passed to `settleOrder` and `announceDelivered`.
