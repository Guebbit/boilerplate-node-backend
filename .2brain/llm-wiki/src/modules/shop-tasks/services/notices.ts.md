---
source: src/modules/shop-tasks/services/notices.ts
sha256: 194b9d2c5525274d3c58e87704de6776218721b8e4be96eb63dce9efe4dbe5fb
generated_at: 2026-11-08T08:16:50.889760+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/services/notices.ts

## Purpose

Maps shop, cart, fulfillment, and return domain events into inbox notification rows (for the buyer) or staff notices (for the acting staff). Each handler is a pure payload→rows transform; the actual write, cap, and live push are delegated to the notifications module. Exists so that `module.ts` can subscribe one function per event without mixing notification logic into domain code.

## Key elements

- **`removedFor(code, payload)`** (private helper) — expands a list of `userIds` into one notification row per user for cart-line or wishlist-item removal.
- **`shopNotices`** (single export) — object whose keys are event handlers:
  - `onCartLinesRemoved` / `onWishlistItemsRemoved` — one `warning` row per affected user.
  - `onStockAlertSent` — one `info` row for the buyer who set the alert.
  - `onCartMergeRefused` — one `warning` row listing all refused lines.
  - `onFulfillmentOrderHoldNoticed` — one `warning` row; no-op when `userId` is undefined (erased account).
  - `onShipmentLost` — one `warning` row with staff-written reason, owed titles, and shop-day dates; no-op for erased accounts.
  - `onFulfillmentOrderDelayedNotice` — one `warning` row (informational only); no-op for erased accounts.
  - `onPurchaseHoldPlaced` — staff notice via `notifyStaff` with a user-detail link and a per-user/per-until dedupe key.
  - `onReturnRequested` — staff notice via `notifyStaff`; short-circuits when `reason === 'withdrawal'` (born-approved, no decision needed).

## Relationships

- **`@modules/notifications`** — calls `notificationsService.create(rows)` for buyer inbox rows and `notificationsService.notifyStaff(...)` for staff alerts. All writing, capping, and live-push logic lives there.
- **`@modules/shop`** — calls `shopDayOf(date)` to convert ISO timestamps into the shop's day representation before embedding in notification params.
- **`../staff-routing`** — reads `SHOP_STAFF_ROUTES` entries to supply the `route` discriminator for `notifyStaff` calls.
- **`@infrastructure/http/frontend-link`** — reads `FRONTEND_LINK_RULES.staffPages.user` to build the deep-link to a user's page in the purchase-hold staff notice.
- **`@kernel/access/tenant`** — imports `DEPLOYMENT_TENANT_ID` as the tenant context for the return-requested staff notice.
- **`@kernel/events`** — imports the `DomainEventMap` type to type every handler's payload.

## Notes

- Severity is `warning` for all buyer-facing rows except `onStockAlertSent`, which is `info` (the module doc-block explains the distinction: a back-in-stock answer is informational, not an error).
- Every buyer-facing handler that could target an erased account guards on `userId === undefined` and resolves early — no row is written, no inbox is invented.
- Staff notices carry their own `route`, `link`, and `dedupeKey`; the notifications module is deliberately unaware of shop-specific routing codes.
- `onReturnRequested` silently drops `reason === 'withdrawal'` events — this is intentional (a withdrawal is born-approved and surfaces in the digest instead).
- Date fields in buyer params are pre-formatted via `shopDayOf` before being passed to the notifications service; the service prints them as-is.
