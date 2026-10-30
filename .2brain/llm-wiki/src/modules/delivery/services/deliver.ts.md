---
source: src/modules/delivery/services/deliver.ts
sha256: c157bd73082ed3f103de3646b9ac49d81fc44db66066cdd9d73a6546632dc323
generated_at: 2026-10-29T03:39:01.971214+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/deliver.ts

## Purpose

Records a shipment's arrival (the "delivery door"). Stamps the shipment as delivered, recomputes the order's progress/summary, and—when this is the last undelivered shipment—transitions the order to `delivered` and starts its withdrawal clock from that arrival instant (CRD Art. 9(2)(b)(i)). A lost shipment that turns up is accepted through the same path. All mutations occur in a single Mongoose transaction.

## Key elements

- **`deliverShipment`** *(exported)* — Public entry point. Runs `deliverAct` inside a transaction via `runAct`, records an audit entry on success, refreshes the shelf hold if the shipment was restored from lost, and returns the shipment view wrapped in `generateSuccess`.
- **`deliverAct`** *(internal)* — The transactional core. Loads the shipment and order in-session, validates the order is deliverable, stamps the shipment (normal or lost-restore), reports progress, settles the order, and announces delivery. Returns a `Delivered` result or a refusal.
- **`Delivered`** *(internal interface)* — Shape handed to post-transaction steps: the shipment doc, the order doc, and a `wasLost` flag.

## Relationships

- **`./act`** — `runAct` provides the Mongoose session/transaction boundary; `refuse` and `refuseMissing` produce typed rejection responses.
- **`./found`** — `restoreLostShipment` re-opens a lost shipment; `viewShipmentOf` builds the public response view.
- **`./progress`** — `reportProgress` recomputes order summary; `settleOrder` finalises status and timestamps.
- **`./announce`** — `announceDelivered` emits the post-delivery notification.
- **`../repository`** — `shipmentRepository.findInSession` / `markDelivered` persist the shipment state.
- **`../model`** — `ShipmentDocument` type for the in-session shipment.
- **`../audit`** — `deliveryAuditActions` supplies the audit action constant.
- **`@modules/orders`** (barrel: `index.ts`, `model.ts`, `services/index.ts`, `domain/lifecycle.ts`) — `canRecordArrival` gates eligibility; `orderService.readOrder` loads the order; `orderService.refreshShelf` syncs stock holds after a lost-restore.
- **`@infrastructure/http/response`** — `generateSuccess` and the `ResponseSuccess`/`ResponseReject` types shape the API response.
- **`@infrastructure/observability/audit`** — `recordAudit` writes the audit trail entry.

## Notes

- The arrival timestamp (`at`) is captured once and shared between the shipment stamp and the order's `lastDeliveredAt` fallback, so the two can never disagree on when the goods arrived.
- A lost-restore path also triggers `orderService.refreshShelf` **after** the transaction commits (the shelf hold moved inside the transaction, but the catalogue copy is refreshed outside it).
- The `wasLost` flag is propagated into audit metadata (`{ wasLost: true }`) but does not change the response shape otherwise.
- `deliverShipment` accepts `authContext` (nullable) only for populating the caller-scoped `actions` array in the view; the transactional act itself uses `context.caller.id`.
