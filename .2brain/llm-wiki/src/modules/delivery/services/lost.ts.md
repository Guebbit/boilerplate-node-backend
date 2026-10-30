---
source: src/modules/delivery/services/lost.ts
sha256: 91bb804d053bda2e531c97d186a148b2070f15c5a26fa215255b79fa1f2aa7fa
generated_at: 2026-10-29T03:40:53.213626+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/lost.ts

## Purpose

Handles staff reporting a parcel as lost or damaged in transit. It marks the shipment `lost`, reopens its units on the **same** fulfillment order (no new order, invoice, or revenue), tops up the stock hold, and—if the shelf cannot cover the full quantity—creates a new fulfillment order on hold for the owed remainder. All mutations commit in a single Mongoose transaction.

## Key elements

- **`LostInput`** (exported interface) – Payload staff submits: `reason` (`ShipmentLostReason`), optional internal `note`, optional buyer-facing `message`.
- **`Lost`** (internal interface) – Transaction result: the updated `ShipmentDocument` and `OrderDocument`.
- **`refuseNotLosable`** – Shared 409 refusal (`DELIVERY_NOT_LOSABLE`) used for every non-losable guard path.
- **`lostAct`** – The transactional core: validates shipment/order state, marks the shipment lost, tops up stock, reclaims the fulfillment order with reopened lines, creates an owed order if needed, reports progress, reopens the order if it was `shipped`, and announces the loss to the buyer.
- **`markShipmentLost`** (exported) – Public entry point. Wraps `lostAct` in `runAct`, records the audit entry, refreshes shelf, and returns a `ResponseSuccess<Shipment>` or refusal.

## Relationships

- **`./act`** – Provides `runAct` (transaction wrapper), `refuse`, and `refuseMissing` used by every guard path.
- **`./owed`** – `createOwedFulfillmentOrder` and `promiseFor` handle the "shelf can't cover it" branch.
- **`./announce`** – `announceLost` emails the buyer and records the owed items on their order view.
- **`./progress`** – `reportProgress` re-enters the `shipped` order into its fulfillment pipeline.
- **`./found`** – `viewShipmentOf` shapes the final response (including auth-gated fields) from the fresh order snapshot.
- **`./services/index.ts`** – Re-exports `markShipmentLost` for the router layer.
- **`../domain` (index → `lost.ts`, `fulfillment.ts`)** – `withLoss` reopens line quantities; `statusOfLines` derives the fulfillment order's next status.
- **`../repository`** – `shipmentRepository.markLost` / `findInSession` and `fulfillmentOrderRepository.claim` / `findInSession` perform the in-session reads and writes.
- **`../model`** – `ShipmentDocument` type used throughout.
- **`../audit`** – `deliveryAuditActions.ADMIN_SHIPMENT_LOST` action constant for the audit record.
- **`@infrastructure/http/response`** – `generateSuccess` and the `ResponseSuccess`/`ResponseReject` union.
- **`@infrastructure/observability/audit`** – `recordAudit` persists the admin action log entry.

## Notes

- **One transaction, no partial state.** Every write (shipment, fulfillment order, owed order, progress, order status, announcement) happens inside the single `runAct` session; any refusal rolls back everything.
- **Idempotency guard via `claim` revision.** The fulfillment order is claimed with its current `revision`; a concurrent modification causes a 409 rather than a silent overwrite.
- **Audit metadata is deliberately minimal.** Only `shipmentId` and `reason` are stored; the free-text `note` is excluded to keep the operator log clean.
- **Order reopen is conditional.** `orderService.markReopened` is called only when the order was in `shipped` status; if it was already in an intermediate status, `reportProgress` alone is sufficient.
- **`titleOf` fallback.** When building the owed order, product titles are looked up from the shipment's own lines; a missing match yields an empty string rather than a throw.
