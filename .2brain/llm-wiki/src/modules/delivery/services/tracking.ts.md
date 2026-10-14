---
source: src/modules/delivery/services/tracking.ts
sha256: b76c41492e1d29d313062ab4314f8ee8c09f0ec9d290a901c78d857b4c66638a
generated_at: 2026-10-14T15:34:59.072222+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/tracking.ts

## Purpose

Provides the business logic for correcting a shipment's tracking code (fixing a typo, not creating a new fact). The correction is only allowed while the shipment is still in `shipped` status; once delivered, the code is immutable history.

## Key elements

- **`editShipmentTracking(shipmentId, trackingCode, authContext, context)`** — The sole export. Resolves the shipment and its parent order, verifies the caller isn't outranked, then either returns the current shipment view (when `trackingCode` is `undefined`, i.e. a no-op merge-patch) or persists the new code via the repository. Returns `ResponseSuccess<Shipment>` (shaped by `viewShipment`) or a `ResponseReject` (404, 409, or an outranked refusal).

## Relationships

- **`@infrastructure/http/response`** — uses `generateSuccess` / `generateReject` and the `ResponseSuccess` / `ResponseReject` types for all return paths.
- **`@infrastructure/i18n`** — calls `t('delivery.shipment-not-found')`, `t('delivery.order-not-found')`, `t('delivery.not-deliverable')` for localized error strings.
- **`@infrastructure/observability/audit`** — calls `recordAudit` after a successful code update.
- **`../audit`** (`delivery/audit.ts`) — reads `deliveryAuditActions.ADMIN_SHIPMENT_TRACKING_EDITED` for the audit action label.
- **`../repository`** (`delivery/repository.ts`) — calls `shipmentRepository.findById` and `shipmentRepository.setTrackingCode`.
- **`./actions`** (`delivery/services/actions.ts`) — calls `viewShipment` to shape the shipment into the response payload.
- **`@modules/orders`** — calls `orderService.getById` (order existence check) and `orderService.outrankedRefusalFor` (permission gate).
- **`@types`** — consumes `AuthContext`, `CallerContext`, and `Shipment` type definitions.

## Notes

- The "shipped-only" guard is **not** an explicit status check in this file. It is delegated to `shipmentRepository.setTrackingCode`, which returns a falsy value when the shipment is no longer editable; the file translates that into a **409** with `ERROR_CODES.DELIVERY_NOT_DELIVERABLE`. The error name reads "not deliverable" but semantically means "already delivered / no longer editable."
- Passing `trackingCode: undefined` is a deliberate no-op (merge-patch semantics): the function skips the write and simply returns the current view. Callers rely on this to "touch" a shipment without mutation.
- The audit entry targets the **order** (`targetType: 'order'`, `targetId: edited.orderId`), not the shipment, with `shipmentId` carried in `metadata`.
