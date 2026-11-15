---
source: src/modules/shop-tasks/openapi.notifications.yaml
sha256: 4672a9742ed6bc66695dd094ea3b7b9b3579ce2eda5cab16cdc916198e13de8a
generated_at: 2026-11-14T21:51:34.061147+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/openapi.notifications.yaml

## Purpose

OpenAPI 3.1.0 contract fragment that extends the base `Notification` schema with 20 shop-specific notification variants (7 buyer-facing, 13 staff-facing). It uses the `x-extends` mechanism to append each variant to the base `oneOf` / `discriminator.mapping`, so a project without a shop module simply never sees these types.

## Key elements

- **`x-extends.Notification`** — ordered list of the 20 notification schema names appended to the base `Notification` union.
- **`ProductTitles`** — locale → product-name map. Copied into notifications because the product row may be deleted before the notification is read.
- **Param schemas** (payload objects attached to each notification):
  - `CartLineRemovedParams` — product ID + titles.
  - `CartMergeRefusedParams` — array of lines `POST /cart/merge` could not add, with requested qty and titles.
  - `FulfillmentDelayedParams` — order/fulfillment IDs, order number, titles, `agreedAt` / `expectedAt` dates.
  - `ShipmentLostParams` — order/shipment IDs, order number, `reason` (`lost`|`damaged`), optional `message`, `owed` titles, `expectedAt`.
  - `FulfillmentHeldParams` — order/fulfillment IDs, order number, `notice` (`check_address`|`delayed`), optional `message`.
- **Buyer notification schemas** (`shop-tasks.*` codes): `NotificationFulfillmentHeld`, `NotificationShipmentLost`, `NotificationStockAlert`, `NotificationFulfillmentDelayed`, `NotificationCartLineRemoved`, `NotificationWishlistItemRemoved`, `NotificationCartMergeRefused`.
- **Staff notification schemas** (`shop-tasks.staff.*` codes): `NotificationStaffPurchaseHoldPlaced`, `NotificationStaffReturnRequested`, `NotificationStaffOutcomeUnknown`, `NotificationStaffTransfersDue`, `NotificationStaffPreordersLate`, `NotificationStaffDeliveryHoldsOpen`, `NotificationStaffReturnsAwaitingGoods`, `NotificationStaffReturnsUndecided`, `NotificationStaffLowStock`, `NotificationStaffUnshipped`, `NotificationStaffAwaitingTracking`, `NotificationStaffUndelivered`, `NotificationStaffStaleRefunds`.
- Each notification schema carries the common envelope fields: `id`, `audience`, `code`, `params`, `severity`, `readAt`, `createdAt`.

## Relationships

- **`src/modules/shop-tasks/asyncapi.notifications.yaml`** — async/event-side counterpart; this file defines the synchronous OpenAPI contract for the same notification payloads.
- **`src/modules/shop-tasks/module.ts`** — module entry point that registers/exposes this contract fragment to the broader service.

## Notes

- `x-extends` only *appends* variants; the base `notifications` module never names them, so a project without a shop has exactly five notices and none of the 20 defined here.
- Notification codes double as dictionary keys in both repos — `shop-tasks.<name>` for buyer, `shop-tasks.staff.<name>` for staff.
- All date fields (`agreedAt`, `expectedAt`, etc.) are calendar days on the shop's timezone (`Shop.timeZone`), not UTC timestamps.
- `message` fields (in `ShipmentLostParams`, `FulfillmentHeldParams`) are staff-authored sentences for the recipient; they never expose staff's internal reason.
- `ProductTitles` is embedded in the payload (not a live lookup) specifically to survive product deletion.
- `readAt` is absent while unread; the unread badge is the count of notifications lacking it.
