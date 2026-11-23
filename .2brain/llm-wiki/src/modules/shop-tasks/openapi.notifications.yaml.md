---
source: src/modules/shop-tasks/openapi.notifications.yaml
source_sha256: fa7c7ad8c649873adacf399713ef2e706e6b138119d6c101f1d3c847f98588f7
context_sha256: a1ee16359e6f4ec0f52512dcf83ea3a2cf397685eb6a201c25499f86adc8aed9
generated_at: 2026-11-22T07:41:59.134375+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/shop-tasks/openapi.notifications.yaml

## Purpose
An OpenAPI 3.1 fragment holding the shop's additions to the notifications contract: buyer-facing messages and staff work notices that only a shop sends. It uses `x-extends` to append its variants to the `Notification` schema, so the `notifications` module never names them. A project without a shop carries only the five base notices and none of these. Codes are namespaced `shop-tasks.<name>` (buyer) and `shop-tasks.staff.<name>` (staff).

## Key elements
- **`x-extends.Notification`**: lists 20 variants to append to `Notification` (`oneOf` and `discriminator.mapping`).
  - Buyer variants (7): `NotificationFulfillmentHeld`, `NotificationShipmentLost`, `NotificationStockAlert`, `NotificationFulfillmentDelayed`, `NotificationCartLineRemoved`, `NotificationWishlistItemRemoved`, `NotificationCartMergeRefused`.
  - Staff variants (13): `NotificationStaffPurchaseHoldPlaced`, `NotificationStaffReturnRequested`, `NotificationStaffOutcomeUnknown`, `NotificationStaffTransfersDue`, `NotificationStaffPreordersLate`, `NotificationStaffDeliveryHoldsOpen`, `NotificationStaffReturnsAwaitingGoods`, `NotificationStaffReturnsUndecided`, `NotificationStaffLowStock`, `NotificationStaffUnshipped`, `NotificationStaffAwaitingTracking`, `NotificationStaffUndelivered`, `NotificationStaffStaleRefunds`.
- **`ProductTitles`**: locale → product name map, copied into the notification because the product may be gone by the time it is read.
- **Params schemas** (all `additionalProperties: false`):
  - `CartLineRemovedParams`: `productId`, `titles`.
  - `CartMergeRefusedParams`: `lines[]` of `productId`, `requested` (integer ≥ 1) and `titles`, for guest-cart lines `POST /cart/merge` could not add at all.
  - `FulfillmentDelayedParams`: `orderId`, `orderNumber`, `fulfillmentOrderId`, `titles[]`, `agreedAt`, and optional `expectedAt`.
  - `ShipmentLostParams`: `orderId`, `orderNumber`, `shipmentId`, `reason` (`lost`|`damaged`), optional `message` (max 500), `owed[]` and `expectedAt`.
  - `FulfillmentHeldParams`: `orderId`, `orderNumber`, `fulfillmentOrderId`, `notice` (`check_address`|`delayed`), optional `message` (max 500). It never carries staff's reason.
- **Notification variant schemas** (e.g. `NotificationFulfillmentHeld`, `NotificationShipmentLost`, `NotificationStockAlert`, `NotificationFulfillmentDelayed`): each requires `id`, `audience`, `code`, `params`, `severity`, `createdAt`, with optional `readAt`. `code` is a single-value enum such as `shop-tasks.fulfillment-held`.

## Relationships
- **`src/modules/shop-tasks/asyncapi.notifications.yaml`**: the sibling AsyncAPI contract in the same module.
- **`src/modules/payments/asyncapi.webhooks.yaml`**: appears as a graph neighbor, but no interaction is visible in this file's shown content.

## Notes
- Variants extend the `Notification` schema defined in the separate `notifications` module's OpenAPI contract and reuse its `NotificationAudience` and `NotificationSeverity` schemas. Ids use the shared `Id` schema from the shared root contract.
- Dates (`agreedAt`, `expectedAt`) are `format: date`, a day on the shop's calendar (`Shop.timeZone`), not instants.
- `orderNumber` is the buyer-facing number (e.g. `2026-000041`), shown as `#…`.
- `NotificationStockAlert` reuses `CartLineRemovedParams` for its `params`. Its description says it is sent once, then the request is gone.
- A code is its own dictionary key in both repos, so renaming a code is a cross-repo change.
- The staff variants' schemas are not shown in the visible portion, only their names in `x-extends`.
