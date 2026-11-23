---
source: src/modules/shop-tasks/services/notices.ts
source_sha256: 7ebea83f401973062c5f1d20cef82ddc844a7629925904294278044561d43e48
context_sha256: a324b6cdd8aa679ee76b9093a36b08ddda228e5323d72d49e74395b7b2bd9607
generated_at: 2026-11-22T07:43:09.106405+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/shop-tasks/services/notices.ts

## Purpose
Maps shop domain events to inbox rows: messages for buyers (removed cart/wishlist items, stock alerts, refused cart merges, held fulfillment orders, lost shipments, delayed preorders) and work notices for staff (purchase holds, return requests). Each function turns an event payload into the rows to write. The actual writing, cap and live push are done by `notificationsService`.

## Key elements
- `shopNotices` – exported object with one handler per event; `module.ts` subscribes each one.
  - `onCartLinesRemoved` / `onWishlistItemsRemoved` – one `warning` row per affected user, built by the private `removedFor` helper (codes `shop-tasks.cart-line-removed` / `shop-tasks.wishlist-item-removed`).
  - `onStockAlertSent` – `info` message `shop-tasks.stock-alert` (the only buyer message that is not `warning`).
  - `onCartMergeRefused` – one `warning` message listing all refused lines.
  - `onFulfillmentOrderHoldNoticed` – `shop-tasks.fulfillment-held`; includes the optional `message`; staff's reason is never passed.
  - `onShipmentLost` – `shop-tasks.shipment-lost`; includes optional `message`, the titles still `owed`, and `expectedAt` converted to a shop day. Staff's note is never included.
  - `onFulfillmentOrderDelayedNotice` – `shop-tasks.fulfillment-delayed`; passes `titles`, `agreedAt` and optional `expectedAt` as shop days. Informational only.
  - `onPurchaseHoldPlaced` – staff notice via `notifyStaff` (`shop-tasks.staff.purchase-hold-placed`), linked to the staff user page, deduped by `purchase-hold-placed:<userId>:<until>`.
  - `onReturnRequested` – staff notice via `notifyStaff` (`shop-tasks.staff.return-requested`) under `DEPLOYMENT_TENANT_ID`, deduped by `return-requested:<returnId>`.
- `removedFor` – non-exported helper that builds the per-owner rows.

## Relationships
- `@modules/notifications` (`notificationsService`): `create` for buyer rows and `notifyStaff` for staff notices.
- `../staff-routing` (`SHOP_STAFF_ROUTES`): supplies the routing for each staff code, since `notifications` doesn't know these codes.
- `@infrastructure/http/frontend-link` (`FRONTEND_LINK_RULES`): supplies the link template for the purchase-hold notice.
- `@kernel/access/tenant` (`DEPLOYMENT_TENANT_ID`): tenant for return-request notices.
- `@kernel/events` (`DomainEventMap`): types the event payloads.
- `@modules/shop` (`shopDayOf`): formats dates as shop days in the lost-shipment and delayed notices.

## Notes
- Buyer notices for hold, lost shipment and delay resolve to a no-op when `userId` is `undefined` (erased account).
- `onReturnRequested` skips returns whose `reason` is `'withdrawal'`, which are born approved and counted by the digest instead.
- `notifyStaff` handlers discard its result (`.then(() => undefined)`) to return `Promise<void>`.
- Optional params are spread in only when present (`message`, `owed`, `expectedAt`).
- The module header describes how each event maps to inbox rows; see `src/modules/shop-tasks/module.ts` for where the handlers are subscribed.
