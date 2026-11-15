---
source: src/modules/delivery/services/lost.ts
sha256: 602216a5c2f0b0805ab5005a3293d684fccbfde93b9ac15bdc9ac8c44b634a7f
generated_at: 2026-11-14T19:47:32.376040+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/lost.ts

## Purpose

Service that lets staff report a parcel as lost or damaged in transit. It reopens the units on the **same** fulfillment order (no new order, invoice, or revenue), tops up the stock hold, creates a new owed fulfillment order for any quantity the shelf cannot cover, steps the order back to `processing`, marks the shipment `lost`, and announces the loss to the buyer — all committed in a single Mongoose transaction.

## Key elements

- **`LostInput`** (exported interface) — the staff payload: `reason` (`ShipmentLostReason`), optional `note` (colleagues only, never mailed), optional `message` (buyer-facing, mailed and shown on the order).
- **`markShipmentLost`** (exported function) — public entry point. Runs `lostAct` inside `runAct` (transactional), then post-commit records an audit entry, refreshes the product shelf, fetches the fresh order, and shapes the HTTP success response via `viewShipmentOf` + `generateSuccess`.
- **`lostAct`** (private) — the transactional body: loads shipment/order/fulfillment order in-session, enforces preconditions, marks the shipment lost, tops up stock, re-opens fulfillment lines via `withLoss`, claims the fulfillment order (optimistic-concurrency on `revision`), creates the owed order if needed, reports progress, reopens the order for fulfillment, and calls `announceLost`.
- **`refuseNotLosable`** (private) — shared 409 `DELIVERY_NOT_LOSABLE` refusal returned whenever the shipment, order, or fulfillment order is in an ineligible state.

## Relationships

- **`src/modules/delivery/services/act.ts`** — provides `runAct` (transaction wrapper), `refuse`, `refuseMissing` for preconditions and error shaping.
- **`src/modules/delivery/services/owed.ts`** — `promiseFor` generates an ETA for the owed quantity; `createOwedFulfillmentOrder` persists the new on-hold fulfillment order.
- **`src/modules/delivery/services/announce.ts`** — `announceLost` sends the buyer-facing notification.
- **`src/modules/delivery/services/found.ts`** — `viewShipmentOf` builds the response payload (shipment + actions) for the caller.
- **`src/modules/delivery/services/progress.ts`** — `reportProgress` updates the order's progress timeline when units are reopened.
- **`src/modules/delivery/domain/lost.ts`** — `withLoss` reopens fulfillment lines after a loss.
- **`src/modules/delivery/domain/fulfillment.ts`** — `statusOfLines` derives the fulfillment order status; provides the `ProductQuantity` type.
- **`src/modules/delivery/repository.ts`** — `shipmentRepository` and `fulfillmentOrderRepository` perform the in-session reads and writes.
- **`src/modules/delivery/model.ts`** — `ShipmentDocument` type for the persisted shipment.
- **`src/modules/delivery/audit.ts`** — provides the delivery audit action constants used in the post-commit log entry.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` writes the operator-log entry after the transaction commits.
- **`src/infrastructure/http/response.ts`** — `generateSuccess` and the `ResponseSuccess`/`ResponseReject` union shape the HTTP return.
- **`src/modules/delivery/services/index.ts`** — barrel re-export for consumers of the delivery services.
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** — unit tests covering the `withLoss` / `statusOfLines` domain logic this service depends on.

## Notes

- **One fulfillment order, not a new one.** Unlike a split or a re-ship, lost units are reopened on the *existing* fulfillment order. No new order document, invoice, or revenue entry is created.
- **Owed vs. covered.** After topping up stock, any quantity the shelf still cannot cover is isolated into a *new* owed fulfillment order (`on_hold`). The original order's lines are adjusted in place.
- **Audit stores only the reason code.** The free-text `note` is deliberately excluded from `recordAudit` metadata to keep the operator log free of unstructured text.
- **Optimistic concurrency.** The fulfillment-order claim uses `origin.revision`; a concurrent modification causes a 409 refusal rather than a silent overwrite.
- **Order status gate.** `canRecordArrival(order.status)` must pass — the order must still be in a state where an arrival (and therefore a loss) is meaningful. A fully cancelled or completed order will be refused.
