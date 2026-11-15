---
source: src/modules/delivery/services/deliver.ts
sha256: fdf318aff498d34f00567a4d3e210e2fc2104ce32a0d95477f69767308b97eb2
generated_at: 2026-11-14T19:45:32.242608+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/deliver.ts

## Purpose

Records a shipment's arrival — the delivery door. In a single transaction it stamps the shipment as delivered (or restores one previously marked lost), recomputes the order's delivery progress, and, when this was the last undelivered shipment with nothing left to ship, settles the order to `delivered` and starts the withdrawal clock from that arrival instant.

## Key elements

- **`Delivered`** (interface) — the value returned by the inner act: the updated `ShipmentDocument`, the `OrderDocument`, and a `wasLost` flag indicating the shipment had been previously reported lost.
- **`deliverAct`** (internal, not exported) — the transactional core. Finds the shipment and its order in the session, guards that the order status can still accept arrivals (`canRecordArrival`), stamps or restores the shipment with a single shared timestamp, then calls `reportProgress` → `settleOrder` → `announceDelivered`.
- **`deliverShipment`** (exported) — the public entry point. Wraps `deliverAct` in `runAct` (transaction), records the audit entry post-commit, optionally refreshes the shelf (stock holds) when a lost shipment was restored, and builds the HTTP success response via `viewShipmentOf` + `generateSuccess`.

## Relationships

- **`src/modules/delivery/services/act.ts`** — provides `runAct` (transaction wrapper), `refuse`, and `refuseMissing` used for error responses.
- **`src/modules/delivery/services/found.ts`** — provides `restoreLostShipment` (re-stamp a lost shipment) and `viewShipmentOf` (build the response payload).
- **`src/modules/delivery/services/progress.ts`** — provides `reportProgress` (recompute delivery summary) and `settleOrder` (transition order to delivered / start withdrawal clock).
- **`src/modules/delivery/services/announce.ts`** — provides `announceDelivered` (post-delivery side-effect notifications).
- **`src/modules/delivery/repository.ts`** — `shipmentRepository.findInSession` and `.markDelivered` for persistence within the transaction.
- **`src/modules/delivery/model.ts`** — `ShipmentDocument` type.
- **`src/modules/delivery/audit.ts`** — `deliveryAuditActions` enum for the audit action identifier.
- **`src/modules/orders/index.ts`** — barrel providing `canRecordArrival`, `orderService.readOrder`, `orderService.refreshShelf`, and the `OrderDocument` type.
- **`src/infrastructure/http/response.ts`** — `generateSuccess` and the `ResponseSuccess`/`ResponseReject` types.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` for the post-commit audit entry.
- **`src/modules/delivery/services/index.ts`** — services barrel that re-exports `deliverShipment`.
- **`src/modules/delivery/tests/unit/lost.test.ts`** — unit tests exercising the lost-shipment restore path.

## Notes

- **Shared timestamp:** `deliverAct` captures a single `at = new Date()` and passes it to both the shipment stamp and (via `settleOrder`) the withdrawal deadline. The two must never disagree about when the goods arrived.
- **`settleOrder` timestamp source:** it receives `progress.summary.lastDeliveredAt ?? at` — the progress report's own recorded last-delivered time takes precedence over the act's local `at`.
- **Lost-shipment restore is a side-path with an extra step:** after the transaction commits, `deliverShipment` calls `orderService.refreshShelf(...)` for the restored shipment's product IDs because the stock hold moved. The normal (non-lost) path skips this.
- **Audit is post-commit:** `recordAudit` runs in the `.then` callback after `runAct` resolves, i.e. after the transaction has committed. It is not inside the transaction.
- **`wasLost` flag in the response metadata:** the audit entry and the returned view both surface whether this was a lost-shipment restore, distinct from a first-time delivery.
