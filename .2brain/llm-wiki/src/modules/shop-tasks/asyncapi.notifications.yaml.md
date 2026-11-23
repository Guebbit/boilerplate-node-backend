---
source: src/modules/shop-tasks/asyncapi.notifications.yaml
source_sha256: 2fdf30e5678f442a6175ae7eb2655d24a155f2f292e80540bc48bcb581107872
context_sha256: 127167bfe627f158d2bb3f2f905e90162ad3e77c7777e1e7bdb759d9c3039d56
generated_at: 2026-11-22T07:40:25.808072+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/shop-tasks/asyncapi.notifications.yaml

## Purpose
An AsyncAPI **fragment** that declares the shop-specific payloads of the `notifications` stream: buyer messages and staff work notices that only a shop sends. It mirrors `src/modules/shop-tasks/openapi.notifications.yaml` variant for variant. The bundler merges it into the `notifications` section only while the shop-tasks module exists. Without the module, the stream's union falls back to the five notices every project has.

## Key elements
- **`x-extends.NotificationPayload`**: appends 20 payload schemas to the base `NotificationPayload` union (`scripts/contracts/asyncapi-section-fragments.ts`). Examples:
  - Buyer-facing: `NotificationFulfillmentHeldPayload`, `NotificationShipmentLostPayload`, `NotificationStockAlertPayload`, `NotificationFulfillmentDelayedPayload`, `NotificationCartLineRemovedPayload`, `NotificationWishlistItemRemovedPayload`, `NotificationCartMergeRefusedPayload`.
  - Staff work notices: `NotificationStaffPurchaseHoldPlacedPayload`, `NotificationStaffReturnRequestedPayload`, `NotificationStaffOutcomeUnknownPayload`, `NotificationStaffTransfersDuePayload`, `NotificationStaffLowStockPayload`, `NotificationStaffUnshippedPayload`, `NotificationStaffStaleRefundsPayload`, plus other `NotificationStaff*` ones.
- **`components.schemas` params payloads**: one per notification, each `additionalProperties: false`:
  - `CartLineRemovedParamsPayload` (`productId`, locale→`titles` map).
  - `CartMergeRefusedParamsPayload`, which holds an array of `CartMergeRefusedLinePayload` (`productId`, `requested` ≥ 1, `titles`).
  - `FulfillmentDelayedParamsPayload` (order and fulfillment ids, `titles`, `agreedAt`, optional `expectedAt`).
  - `FulfillmentHeldParamsPayload` (`notice` is `check_address` or `delayed`; optional `message`, max 500 chars).
  - `ShipmentLostParamsPayload` (`reason` is `lost` or `damaged`; optional `message`, `owed`, `expectedAt`).
  - `PurchaseHoldPlacedParamsPayload` (`userId`, `until` as date-time).
- **`Notification*Payload` envelopes**: each has the same shape.
  - Required fields: `id`, `audience` (`own` | `staff`), `code`, `params`, `severity` (`info` | `success` | `warning` | `error`), `createdAt`.
  - Optional field: `readAt`.
  - `code` is a single-value enum, for example `shop-tasks.staff.purchase-hold-placed`, `shop-tasks.fulfillment-held`, `shop-tasks.shipment-lost`, `shop-tasks.stock-alert`.
  - `params` is a `$ref` to the matching params schema.

## Relationships
- **`src/modules/shop-tasks/openapi.notifications.yaml`**: the REST/OpenAPI counterpart. This file repeats its variants rather than referencing them. The producer is typed against both, which keeps them aligned.

## Notes
- It is not a standalone document. It only works when merged by the bundler.
- Schemas are duplicated on purpose, because an AsyncAPI document is validated and generated on its own.
- Order matters. Members are listed before the union that names them, because the generated Zod schemas are `const`s.
- `NotificationStockAlertPayload` reuses `CartLineRemovedParamsPayload` as its `params`.
- When the openapi variants change, update this file to match.
