---
source: scenarios/flows/backdate.ts
source_sha256: d5f8c3b8209156242208447fcd0b7207fbe77450d5b649a421740e80304a2e50
context_sha256: 75fac8b87c4d3eb84edb28051c80ae8ef21f6c7320143fba8be7f3c24e069e69
generated_at: 2026-11-22T01:42:59.916534+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/flows/backdate.ts

## Purpose
Moves a flow-produced order, and everything the application wrote because of it, into the past. Flows run at boot, so without this every demo-shop order would be dated the minute the container started, leaving analytics charts with no trend and date filters with nothing outside them. Backdating is done per order (never a blanket shift) so the order, payment, shipment, hold, stock movements and audit rows stay consistent about when things happened.

## Key elements
- `backdateHistory(ages)` — the only export. Takes `order id → days back`, first waits for the audit trail to settle, then backdates all orders concurrently.
- `backdateOrder(orderId, days)` (internal) — runs every entry in `TRAILS` for one order. A no-op when `days <= 0`.
- `mover(model, find, dates)` (internal factory) — returns a function `(orderId, days)` that runs `updateMany` with an aggregation-pipeline `$set` over one collection. The factory keeps each filter type-checked against its own schema, with no `any`.
- `TRAILS` (internal) — the list of movers, one per collection or slice of an order's history:
  - orders: `createdAt`, `updatedAt`, `deletedAt`, `withdrawUntil`, `conformityUntil`.
  - orders, only where `fulfillment.lastDeliveredAt` exists: that date.
  - payments: `createdAt`, `updatedAt`, `receivedAt`.
  - fulfillment orders: `createdAt`, `updatedAt`, `agreedAt`, `expectedAt`.
  - shipments: `createdAt`, `updatedAt`, `shippedAt`, `deliveredAt`.
  - reservations: `createdAt`, `updatedAt`, `expiresAt`.
  - stock movements: `createdAt`, `updatedAt`.
  - audit logs: `timestamp`.
- `shiftStage(dates, days)` (internal) — builds the `$set` stage using `$dateSubtract` per field. `$ifNull` falls back to `$$REMOVE`, so absent columns stay absent rather than becoming null.
- `settleAuditTrail()` (internal) — polls `auditLogModel.countDocuments()` every 50 ms, up to 20 rounds, until two consecutive counts match.

## Relationships
- `scenarios/flows/shop-history.ts` — the source of the order ids and ages passed to `backdateHistory`, which dates the orders it produces.
- `src/modules/orders/model.ts` — `orderModel`, matched by `_id`.
- `src/modules/payments/model.ts` — `paymentModel`, matched by `orderId`.
- `src/modules/delivery/model.ts` — `fulfillmentOrderModel` and `shipmentModel`, both matched by `orderId`.
- `src/modules/inventory/model.ts` — `reservationModel` (matched by `orderId`) and `stockMovementModel` (matched by `reference`).
- `src/modules/audit-logs/model.ts` — `auditLogModel`, matched by `targetId`. It is also counted in `settleAuditTrail`.

## Notes
- Two collections reference the order by a string in a free-text column (`stockmovements.reference`, `auditlogs.targetId`). The other collections use a real `ObjectId` reference, so each mover has its own filter.
- `updatePipeline: true` is required because Mongoose 9 rejects array updates without it.
- `timestamps: false` is required. Otherwise Mongoose would stamp `updatedAt` with the current time and undo the backdating.
- The `fulfillment.lastDeliveredAt` mover is filtered with `$exists`. Without that, a pipeline `$set` on a dotted path would create an empty `fulfillment` object on orders that have none, and the next save would fail on required fields.
- `settleAuditTrail` exists because audit emission is fire-and-forget (`record` returns `void`), so late entries could otherwise stay dated at boot time.
- Concurrency: orders run concurrently with each other. Within one order, the collection writes are all started together through `Promise.all`, although the doc comment calls them sequential.
