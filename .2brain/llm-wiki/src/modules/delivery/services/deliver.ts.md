---
source: src/modules/delivery/services/deliver.ts
sha256: 3abfd020b79eba68fd142aaa811e58848a53824b56bd31f9102aa92cb3e1a0d1
generated_at: 2026-11-08T05:34:50.293908+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/deliver.ts

## Purpose

Records a shipment's arrival (the "delivery door"). Stamps the shipment as delivered, recomputes the order's fulfilment progress, and—if this was the last undelivered shipment—moves the order to `delivered` and starts its withdrawal clock. Also handles the special case of a previously-lost shipment that is found and accepted back. All state changes commit in a single Mongoose transaction.

## Key elements

- **`deliverShipment`** (export) — Public entry point. Opens a transaction via `runAct`, calls `deliverAct`, then post-commit: records an audit entry, optionally refreshes the catalogue shelf (lost-shipment case), builds the response view, and returns a `ResponseSuccess<Shipment>` or a typed refusal.
- **`deliverAct`** (internal) — The transactional core. Loads the shipment and order, gates on `canRecordArrival`, stamps the shipment (via `markDelivered` or `restoreLostShipment`), calls `reportProgress` + `settleOrder` to recompute order state and the withdrawal deadline, and fires `announceDelivered`. Returns a `Delivered` snapshot.
- **`Delivered`** (interface) — Shape carried out of the transaction: the updated `ShipmentDocument`, the `OrderDocument`, and a `wasLost` flag.

## Relationships

- **`./act`** — `runAct` wraps the call in a Mongoose transaction; `refuse` / `refuseMissing` produce typed `ResponseReject` objects on failure paths.
- **`./found`** — `restoreLostShipment` re-activates a lost shipment inside the transaction; `viewShipmentOf` builds the public response shape after commit.
- **`./progress`** — `reportProgress` recomputes fulfilment summary; `settleOrder` finalises the order status and the `lastDeliveredAt` timestamp (used as the withdrawal-clock origin per CRD Art. 9(2)(b)(i)).
- **`./announce`** — `announceDelivered` fires downstream notifications inside the same session.
- **`../repository`** — `shipmentRepository.findInSession` / `markDelivered` perform the shipment reads/writes.
- **`../audit`** — `deliveryAuditActions` supplies the stable audit-action enum value.
- **`@modules/orders`** — `orderService.readOrder` loads the order; `canRecordArrival` (from `domain/lifecycle`) gates whether the order's state permits an arrival; `orderService.refreshShelf` updates catalogue stock-hold after a lost-shipment restore.
- **`@infrastructure/http/response`** — `generateSuccess` shapes the final HTTP response.
- **`@infrastructure/observability/audit`** — `recordAudit` writes the audit log entry post-commit.

## Notes

- The withdrawal-clock timestamp is taken from `progress.summary.lastDeliveredAt ?? at`, **not** blindly from `new Date()`—the progress report is the source of truth for "when the last good arrived," and the `at` fallback only covers the edge where the summary is empty.
- The shelf-refresh (`orderService.refreshShelf`) runs **after** the transaction commits (outside the session). A failed refresh does not roll back the delivery.
- `deliverShipment` is the sole export; `deliverAct` is intentionally private.
- The `wasLost` flag propagates into the audit metadata and the response view so downstream consumers can distinguish a restore from a normal delivery.
- The file is tested by `src/modules/delivery/tests/unit/lost.test.ts` (lost-shipment path) and presumably other unit tests for the happy path.
