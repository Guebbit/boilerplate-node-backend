---
source: src/modules/delivery/services/lost.ts
sha256: 91bb804d053bda2e531c97d186a148b2070f15c5a26fa215255b79fa1f2aa7fa
generated_at: 2026-11-08T05:36:34.490015+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/lost.ts

## Purpose

Staff-facing service that reports a parcel lost or damaged in transit. It marks the shipment as `lost`, reopens its units on the **same** fulfillment order (no new order, invoice, or revenue), tops up the stock hold, and—if the shelf cannot cover the gap—creates a new owed fulfillment order on hold for stock. All writes commit in a single Mongoose transaction.

## Key elements

- **`LostInput`** (exported interface) – the request body staff send: `reason` (`ShipmentLostReason`), optional internal `note`, optional buyer-facing `message`.
- **`refuseNotLosable`** – shared refusal helper; throws a 409 `DELIVERY_NOT_LOSABLE` `ActRefusal`.
- **`lostAct`** (private) – the transactional core. Validates the shipment is `shipped`/physical and the order is in a recordable state, marks the shipment lost, calls `orderService.topUpStock`, computes reopened lines via `withLoss`, claims the fulfillment order with a revision check, optionally creates an owed fulfillment order (`createOwedFulfillmentOrder`), reports progress, reopens the order if it was `shipped`, and calls `announceLost`.
- **`markShipmentLost`** (exported function) – public entry point. Wraps `lostAct` in `runAct` (transaction), records an audit entry (`ADMIN_SHIPMENT_LOST`), refreshes the shelf, re-reads the order, and returns the shipment view via `viewShipmentOf` + `generateSuccess`.

## Relationships

- **`src/modules/delivery/services/act.ts`** – provides `runAct` (transaction runner), `refuse`, and `refuseMissing` used for all guard clauses and the 409 path.
- **`src/modules/delivery/services/owed.ts`** – `createOwedFulfillmentOrder` and `promiseFor` are called when stock cannot fully cover the reopened lines.
- **`src/modules/delivery/services/announce.ts`** – `announceLost` sends the buyer notification and records the owed items for display.
- **`src/modules/delivery/services/progress.ts`** – `reportProgress` re-enters the order's fulfillment cycle after units are reopened.
- **`src/modules/delivery/services/found.ts`** – `viewShipmentOf` shapes the final response payload for the caller.
- **`src/modules/delivery/domain/index.ts`** – `withLoss` computes reopened lines; `statusOfLines` derives the next fulfillment-order status; `ProductQuantity` is the line shape.
- **`src/modules/delivery/repository.ts`** – `shipmentRepository.markLost` / `findInSession` and `fulfillmentOrderRepository.claim` / `findInSession` perform the persisted writes.
- **`src/modules/delivery/audit.ts`** – `deliveryAuditActions.ADMIN_SHIPMENT_LOST` is the audit action enum value recorded post-commit.
- **`src/infrastructure/observability/audit.ts`** – `recordAudit` writes the structured audit log entry.
- **`src/infrastructure/http/response.ts`** – `generateSuccess`, `ResponseReject`, `ResponseSuccess` shape the HTTP response.
- **`src/modules/delivery/model.ts`** – `ShipmentDocument` type used in the internal `Lost` return.

## Notes

- The note (`input.note`) is **never** stored in audit metadata—only the reason code is recorded, to keep the operator log free of free-text.
- `lostAct` does **not** create a new fulfillment order for the reopened units; it reuses the original one via `claim` (revision-checked optimistic concurrency). A *second*, separate owed order is only created for the portion the shelf cannot cover.
- The buyer-facing `message` is reaped by `announceLost` and shown on the buyer's order page; it is not persisted on the shipment document itself.
- If the order was in `shipped` status, `orderService.markReopened` is called to flip it back; if it was already in an earlier status, the order is left as-is.
- Shelf refresh (`orderService.refreshShelf`) happens **after** the transaction commits, in the non-transactional `.then` chain, so it does not participate in rollback.
