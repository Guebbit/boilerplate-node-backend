---
source: scenarios/flows/backdate.ts
sha256: 75d208091264e3bcf7d9f3f0809b686339a6bd25c9e07689ca3d895ffe1d779e
generated_at: 2026-10-14T06:57:27.811856+00:00
model: ollama:qwen3.8:27b
---

# scenarios/flows/backdate.ts

## Purpose

Shifts every order (and all rows the application wrote on its behalf) back into the past so that the demo shop has a believable time span. Without this, all records carry the container-start timestamp, making analytics charts flat and time-range filters meaningless.

## Key elements

- **`mover`** (internal factory) – Given a Mongoose model, an order-id lookup function, and a list of date fields, returns a closure that rewrites those fields via an aggregation-pipeline `$set`. Keeps each collection's filter type-checked against its own schema.
- **`TRAILS`** (internal array) – Seven `mover` instances covering `orders`, `payments`, `fulfillment-orders`, `shipments`, `reservations`, `stock-movements`, and `audit-logs`.
- **`shiftStage`** (internal) – Builds the `$set` pipeline stage: each field becomes `{ $ifNull: [{ $dateSubtract: … }, '$$REMOVE'] }`, so absent fields (e.g. `deletedAt`) stay absent rather than becoming `null`.
- **`backdateOrder`** (internal) – No-op when `days <= 0`; otherwise fires all seven trail movers concurrently via `Promise.all`.
- **`settleAuditTrail`** (internal) – Polls `auditLogModel.countDocuments()` every 50 ms (up to 20 rounds) until the count stabilises, ensuring fire-and-forget audit writes have landed before backdating begins.
- **`backdateHistory`** (exported) – Entry point. Takes `Record<string, number>` (order-id → days-back), waits for the audit trail to settle, then backdates all orders concurrently.

## Relationships

- **`src/modules/orders/model.ts`** – Provides `orderModel`; the primary entity whose dates and `fulfillment.lastDeliveredAt` are shifted.
- **`src/modules/payments/model.ts`** – Provides `paymentModel`; matched by `orderId`, shifts `receivedAt`.
- **`src/modules/delivery/model.ts`** – Provides `fulfillmentOrderModel` and `shipmentModel`; both matched by `orderId`, shift domain-specific timestamps (`agreedAt`, `expectedAt`, `shippedAt`, `deliveredAt`).
- **`src/modules/inventory/model.ts`** – Provides `reservationModel` (matched by `orderId`, shifts `expiresAt`) and `stockMovementModel` (matched by **string** `reference`, shifts `createdAt`/`updatedAt`).
- **`src/modules/audit-logs/model.ts`** – Provides `auditLogModel`; matched by **string** `targetId`, shifts `timestamp`. Also used in `settleAuditTrail` for the count-poll.
- **`scenarios/index.ts`** – Upstream orchestrator that invokes `backdateHistory` as part of the boot-time flow sequence.
- **`src/infrastructure/runtime/provider-registry.ts`** – Supplies the Mongoose model instances that the module-level imports resolve to.

## Notes

- **Per-order, never bulk.** Each order's trail is shifted independently so that cross-collection timestamps remain mutually consistent.
- **`timestamps: false` is load-bearing.** Without it Mongoose would stamp `updatedAt` with the current time, undoing the backdate on the very row being rewritten.
- **`updatePipeline: true`** is required because Mongoose 9 rejects a bare array in `updateMany` without this flag.
- **String vs ObjectId references.** `stockmovements` (`reference`) and `auditlogs` (`targetId`) store the order id as a plain string, not an `ObjectId`; the `mover` factory accepts a per-collection `find` function precisely to handle this difference without `any`.
- **`$$REMOVE` semantics.** Fields that are null or absent on a given document (e.g. `deletedAt` on a live order, `receivedAt` on a pending payment) remain absent after the update rather than being set to `null`.
- **`settleAuditTrail`** uses a "two equal counts" loop with a 50 ms beat rather than a fixed sleep, so it adapts to machine speed and exits as soon as the audit log stops growing.
