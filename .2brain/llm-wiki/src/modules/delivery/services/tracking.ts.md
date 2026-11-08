---
source: src/modules/delivery/services/tracking.ts
sha256: 260a53573e003cc0bbe727e70ee5c5d6a67a705cb59320b68f4f00769025a2e7
generated_at: 2026-11-08T05:40:48.047059+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/tracking.ts

## Purpose

Service that sets or corrects a physical shipment's tracking code at any point in its lifecycle. It validates the shipment, performs a conditional write, records an audit entry, and notifies the buyer when the code actually changed. It exists to isolate this "evidence-critical" mutation from the broader delivery service surface.

## Key elements

- **`editShipmentTracking`** (exported) — Main entry point. Looks up the shipment, rejects non-physical fulfillments (409), optionally updates the tracking code via the repository, then returns the shipment view. If `trackingCode` is `undefined` the call is a read-only merge-patch no-op that simply returns the current view.
- **`afterEdited`** (internal) — Post-write side effects: records the audit entry and mails the buyer. Chooses `"added"` (first code) vs `"corrected"` (replacement); skips the mail entirely if the code is unchanged.
- **`trackingAuditMetadata`** (internal) — Builds the audit metadata object. Includes the `changes` block (via `fieldChange`) only when the before and after values differ.

## Relationships

- **`@modules/delivery/repository`** — Calls `shipmentRepository.findById` and `shipmentRepository.setTrackingCode` for all reads/writes.
- **`@modules/delivery/services/found`** — Calls `viewShipmentOf` to shape the `Shipment` response view.
- **`@modules/delivery/services/notify`** — Calls `mailTrackingChanged` to send the buyer's "added"/"corrected" email.
- **`@modules/orders`** — Calls `orderService.getById` to fetch the order needed by `viewShipmentOf`.
- **`@infrastructure/observability/audit`** — Calls `recordAudit` to log the edit under `deliveryAuditActions.ADMIN_SHIPMENT_TRACKING_EDITED`.
- **`@infrastructure/observability/audit-changes`** — Uses `fieldChange` to structure the before/after pair in audit metadata.
- **`@infrastructure/http/response`** — Uses `generateSuccess` / `generateReject` to shape API responses.
- **`@infrastructure/i18n`** — Uses `t` for localized error strings.
- **`@types`** — Consumes `AuthContext`, `CallerContext`, `Shipment`, and `FulfillmentOrderKind`.
- **`@modules/delivery/audit`** — Reads the `deliveryAuditActions` enum for the audit action key.
- **`@modules/delivery/model`** — Imports the `ShipmentDocument` type used as the repository's document shape.

## Notes

- **Digital fulfillments are hard-rejected (409).** They never had a carrier, so there is no tracking code to set. The check uses `FulfillmentOrderKind.physical`.
- **Idempotent write, non-idempotent side effects.** Saving the same code again is a no-op on the mail path (no "corrected" re-send), but the audit entry is still recorded on every call.
- **`trackingCode === undefined` is not an error.** It is treated as an empty merge patch: the function reads the shipment and returns the current view without writing anything.
- **Two caller contexts are threaded separately:** `authContext` feeds the response's `actions` metadata (via `viewShipmentOf`); `context` (a `CallerContext`) feeds the audit log.
