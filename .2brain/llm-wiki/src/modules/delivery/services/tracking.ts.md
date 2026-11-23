---
source: src/modules/delivery/services/tracking.ts
generated_at: 2026-11-22T04:59:54.143784+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/services/tracking.ts

## Purpose
Implements the admin operation that sets or corrects a shipment's tracking code. It works at any point after the shipment has left, including delivered and lost shipments, because the code is most useful later as evidence in "never arrived" disputes. Digital fulfillments have no carrier, so they are rejected. It audits each edit and mails the buyer when the code changed.

## Key elements
- `editShipmentTracking(shipmentId, trackingCode, authContext, context)` is the only export. It returns `Promise<ResponseSuccess<Shipment> | ResponseReject>`.
  - It returns 404 if the shipment is not found.
  - It returns 409 with `ERROR_CODES.DELIVERY_NOT_PHYSICAL` if the shipment's `kind` is not `FulfillmentOrderKind.physical`.
  - It returns 404 if the owning order is not found.
  - If `trackingCode` is `undefined`, it writes nothing and returns the current shipment view. This is the "merge patch with no field" case.
  - Otherwise it calls `shipmentRepository.setTrackingCode`, runs `afterEdited`, and returns the refreshed shipment view. It returns 404 if the write yields no document.
- `afterEdited` (internal) records the audit entry and mails the buyer if the code changed.
  - The audit entry uses the action `ADMIN_SHIPMENT_TRACKING_EDITED`, `targetType: 'order'` and the order id as `targetId`.
  - It sends the mail only when the code actually changed. The notice is `'corrected'` if a code existed before and `'added'` if not.
- `trackingAuditMetadata` (internal) returns `{ shipmentId }`. When the code changed, it also adds `changes.trackingCode` as a `fieldChange(before, after)`, so the trail records the previous value.

## Relationships
- `./found`: `viewShipmentOf` builds the response view of the shipment, using the order and `authContext`.
- `./notify`: `mailTrackingChanged` sends the "added" or "corrected" email.
- `../repository`: `shipmentRepository.setTrackingCode` writes the tracking code. `ShipmentDocument` comes from `../model`.
- `../audit`: supplies `deliveryAuditActions`.
- `@infrastructure/observability/audit` and `audit-changes`: provide `recordAudit` and `fieldChange`.
- `@modules/orders`: provides `orderService`, used to load the order the shipment belongs to.
- `@infrastructure/http/response`: provides `generateSuccess` and `generateReject` and the response types.
- `@infrastructure/i18n`: provides `t` for the localized error messages.
- `@types`: provides `AuthContext`, `CallerContext`, `Shipment` and `FulfillmentOrderKind`.

## Notes
- Saving the same code again still writes an audit entry, but its metadata has no `changes`, and no email is sent.
- The audit entry is recorded with `recordAudit` and is not awaited. Only the mail promise is chained.
- The order lookup runs before the "no field supplied" shortcut, so a missing order returns 404 even when nothing would be changed.
