---
source: src/modules/delivery/services/tracking.ts
sha256: 96059c663b419aead1908df7dc013e096190412ab32127ad512d38946f1823df
generated_at: 2026-10-29T03:44:51.630832+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/tracking.ts

## Purpose

Service function for setting or correcting a shipment's tracking code. It validates that the shipment is physical, persists the code via the repository, records an audit entry, and conditionally notifies the buyer (first code → "added" email; replacement → "corrected" email). Exists as a dedicated service so the tracking-edit use case is isolated from other shipment mutations.

## Key elements

- **`editShipmentTracking(shipmentId, trackingCode, authContext, context)`** (exported) — Main entry point. Loads the shipment, rejects if not found (404) or not physical (409), loads the parent order, then either returns a read-only view (when `trackingCode` is `undefined`) or writes the new code and returns the updated view.
- **`afterEdited(found, edited, context)`** (internal) — Post-write side effects: records the audit entry unconditionally; mails the buyer only when the code value actually changed.
- **`trackingAuditMetadata(shipmentId, before, after)`** (internal) — Builds the metadata payload for `recordAudit`. Includes a `changes.trackingCode` field (via `fieldChange`) only when `before !== after`, so the audit trail answers "what was it before."

## Relationships

- **`../repository`** — Calls `shipmentRepository.findById` (read) and `shipmentRepository.setTrackingCode` (write) to persist the code.
- **`../model`** — Imports `ShipmentDocument` type used throughout the function signatures.
- **`../audit`** — Imports `deliveryAuditActions.ADMIN_SHIPMENT_TRACKING_EDITED` as the audit action key.
- **`./found`** — Calls `viewShipmentOf(edited, order, authContext)` to shape the API response.
- **`./notify`** — Calls `mailTrackingChanged(edited, 'added' | 'corrected')` for buyer notification.
- **`@modules/orders`** — Calls `orderService.getById` to load the parent order (required by `viewShipmentOf`).
- **`@infrastructure/http/response`** — Uses `generateSuccess` / `generateReject` and the `ResponseSuccess` / `ResponseReject` types for the return value.
- **`@infrastructure/i18n`** — Uses `t()` for localized error messages (not-found, not-physical).
- **`@infrastructure/observability/audit`** — Calls `recordAudit` to log the edit.
- **`@infrastructure/observability/audit-changes`** — Calls `fieldChange(before, after)` to structure the diff in audit metadata.
- **`@types`** — Imports `FulfillmentOrderKind` (to check `.physical`), `AuthContext`, `CallerContext`, and `Shipment` types.

## Notes

- `trackingCode === undefined` is a **read-only no-op** path (merge-patch semantics): the function returns the current shipment view without writing anything.
- The audit entry is recorded **even when the code is unchanged**; the buyer email is suppressed in that case.
- Digital (non-physical) fulfillments are rejected with a 409 and the `DELIVERY_NOT_PHYSICAL` error code — there is no code to set.
- The function loads the parent order solely to pass it to `viewShipmentOf`; the order itself is not mutated.
