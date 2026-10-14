---
source: src/modules/delivery/services/deliver.ts
sha256: 3e13b51d9060c5c184b3e4f5fbb9dc406dc1aca316349603434aba3bb71e2dd8
generated_at: 2026-10-14T15:28:51.516549+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/deliver.ts

## Purpose

Records a shipment's arrival (the "delivery door"). Within a single Mongoose transaction it stamps the shipment as delivered, recomputes the parent order's summary, and—when this was the last undelivered shipment with nothing left to ship—transitions the order to `delivered` and starts the CRD withdrawal clock. Supports a "forced" path that bypasses carrier confirmation but requires an override permission and a recorded reason.

## Key elements

- **`DeliverInput`** (exported interface) — Caller-supplied input: optional `forced` flag and `reason` string for override history.
- **`Delivered`** (private interface) — Internal pair of `{ shipment: ShipmentDocument; order: OrderDocument }` returned by the transactional act.
- **`deliverAct`** (private function) — The core transaction body: loads shipment and order in-session, guards order status (`processing`/`shipped` only), stamps the shipment with a single shared timestamp, reports progress, settles the order (status, summary, `lastDeliveredAt`), optionally records a forced-fulfilment entry, and fires the `announceDelivered` event.
- **`deliverShipment`** (exported function) — Public entry point. Validates permissions (`refuseUnearnedForce`), loads shipment/order outside the transaction for early 404s, checks outranked-refusal, then wraps `deliverAct` in `runAct` (the transaction runner). On success, fires `notifyDelivered`, writes an audit record, and returns the shipment view via `viewShipment`.

## Relationships

- **`./act`** — Provides `runAct` (transaction wrapper), `refuse`, and `refuseMissing` used for the refusal/transaction contract.
- **`./progress`** — `reportProgress` recomputes the order's shipment summary; `settleOrder` applies the new status and `lastDeliveredAt` to the order document.
- **`./force`** — `refuseUnearnedForce` gates the `forced` path before any I/O.
- **`./announce`** — `announceDelivered` emits the domain event inside the transaction.
- **`./notify`** — `notifyDelivered` dispatches post-commit notifications (outside the transaction).
- **`./actions`** — `viewShipment` builds the API response view from the committed shipment and order.
- **`../repository`** — `shipmentRepository` performs all shipment reads/writes (`findInSession`, `markDelivered`, `findById`).
- **`../model`** — `ShipmentDocument` type for the repository's return shape.
- **`../audit`** — `deliveryAuditActions` supplies the audit action enum value (`ADMIN_ORDER_DELIVERED`).
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` and their types shape every return path.
- **`@infrastructure/i18n`** — `t()` resolves user-facing error strings.
- **`@infrastructure/observability/audit`** — `recordAudit` writes the post-commit audit entry.

## Notes

- `deliverAct` is deliberately **not exported**; it can only run inside `runAct`'s transaction scope. Callers must go through `deliverShipment`.
- A single `const at = new Date()` is captured once and passed to both `markDelivered` and `settleOrder` so the shipment stamp and the order's withdrawal deadline can never disagree.
- The withdrawal clock uses `progress.summary.lastDeliveredAt ?? at` — if the order already had a prior delivered shipment, that earlier timestamp governs the deadline, not the current arrival.
- Refusals inside the transaction (e.g. wrong order status) use the `refuse` helper, which **throws** to roll back the transaction; refusals outside it (404s, permission) return a `ResponseReject` directly.
- The `forced` path adds an extra `orderService.recordForcedFulfilment` call within the same transaction, so the override history entry is atomic with the delivery itself.
