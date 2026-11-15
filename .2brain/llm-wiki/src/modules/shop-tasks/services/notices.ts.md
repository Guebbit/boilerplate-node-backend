---
source: src/modules/shop-tasks/services/notices.ts
sha256: e4a71f476136a1728515a78bbe89955200a494fd5e5a93ffefa92b05ecfe8d6b
generated_at: 2026-11-14T21:53:12.149470+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/services/notices.ts

## Purpose

Maps each shop-related domain event to the notification rows that should be written: a buyer-facing inbox message (parcel lost, preorder delayed, stock restocked, cart/wishlist line removed) or a work notice for the staff who can act (purchase hold, return request). Each handler is a pure payload-to-rows mapping; the actual writing, capping, and live push are delegated to `notificationsService`.

## Key elements

- **`removedFor`** (private helper) – Expands a multi-user removal event into one notification row per affected user for cart-line or wishlist-item removal.
- **`shopNotices`** (exported object) – One method per subscribed event:
  - `onCartLinesRemoved` / `onWishlistItemsRemoved` – Buyer inbox warning per affected user.
  - `onStockAlertSent` – Buyer inbox info: a watched product is back in stock.
  - `onCartMergeRefused` – Buyer inbox warning listing all lines that could not be merged.
  - `onFulfillmentOrderHoldNoticed` – Buyer inbox warning with the staff-visible notice text (never the internal reason).
  - `onShipmentLost` – Buyer inbox warning with reason, owed item titles, and shop-day-formatted `expectedAt`.
  - `onFulfillmentOrderDelayedNotice` – Buyer inbox warning informing of a moved/missed preorder date (informational only).
  - `onPurchaseHoldPlaced` – Staff notification (via `notifyStaff`) with a dedupe key, routed link, and the user's frontend page URL.
  - `onReturnRequested` – Staff notification for a return decision; **skips** `reason === 'withdrawal'` (a right, not a decision).

## Relationships

- **`src/kernel/events.ts`** – Provides the `DomainEventMap` type used to type every handler's payload.
- **`src/kernel/access/tenant.ts`** – Imports `DEPLOYMENT_TENANT_ID` as the fixed tenant for the return-request staff notice.
- **`src/infrastructure/http/frontend-link.ts`** – Imports `FRONTEND_LINK_RULES` to build the staff link to the user's page in `onPurchaseHoldPlaced`.
- **`src/modules/notifications/index.ts`** – Exports `notificationsService`; this file calls its `create()` for buyer inbox rows and `notifyStaff()` for staff work notices.
- **`src/modules/notifications/services/index.ts`** – The services layer implementing the writing, capping, and live push behind `notificationsService`.
- **`src/modules/shop/index.ts`** – Imports `shopDayOf` to convert timestamps into the shop-day string the inbox renders.
- **`src/modules/shop-tasks/staff-routing.ts`** – Imports `SHOP_STAFF_ROUTES` to supply the route code for each staff notice (the notifications service has no knowledge of these codes).
- **`src/modules/shop-tasks/services/index.ts`** – Re-exports `shopNotices` so other parts of the module can import it.

## Notes

- **Erased accounts:** Any buyer-facing handler whose payload has `userId === undefined` short-circuits to `Promise.resolve()` — no row is written and no error is raised.
- **Two notification paths:** Buyer messages go through `notificationsService.create()` (one call, many rows); staff notices go through `notificationsService.notifyStaff()` (one call per event) and carry their own `route`, `link`, and `dedupeKey` because the notifications layer is unaware of shop-tasks routing.
- **Dedupe keys** on staff notices (`purchase-hold-placed:{userId}:{until}`, `return-requested:{returnId}`) prevent duplicate alerts if the same event fires more than once.
- **`shopDayOf`** is applied to `expectedAt`/`agreedAt` before passing into notification params so the inbox displays a shop-local day rather than a raw timestamp.
- **Severity convention:** Buyer notices are `warning` except stock-restock which is `info`; the file doc-block calls this out explicitly.
