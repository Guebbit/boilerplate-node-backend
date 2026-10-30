---
source: src/modules/notifications/services/index.ts
sha256: 797b000a9410261b8e875c824fc825634f996b7270d3fb3688e8b2dedcc11657
generated_at: 2026-10-29T04:30:41.465433+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/services/index.ts

## Purpose

Facade that aggregates the three internal notification services (`inbox`, `stream`, `subscribers`) behind a single exported object, `notificationsService`. Controllers and sibling modules interact with notifications exclusively through this surface rather than importing sub-service files directly.

## Key elements

- **`notificationsService`** — the sole export. A plain object bundling:
  - **Inbox CRUD** (`list`, `listStaffNotices`, `listVisible`, `get`, `create`, `remove`, `dismissAll`, `readAll`, `removeByUserId`) — delegates to `./inbox`.
  - **Stream** (`stream`, `publishToUser`, `openStreamCount`) — delegates to `./stream`.
  - **Domain-event handlers** (`onCartLinesRemoved`, `onWishlistItemsRemoved`, `onCartMergeRefused`, `onFulfillmentOrderDelayed`, `onStockAlertSent`, `onFulfillmentOrderHoldNoticed`, `onShipmentLost`, `onPurchaseHoldPlaced`, `onWebhookSubscriptionAutoDisabled`, `onTicketOpened`, `onTicketAssigned`, `onReturnRequested`, `onOutboxEventDead`) — delegates to `./subscribers`.

## Relationships

- **Consumed by** every controller in `controllers/` (`get-notifications`, `get-notification`, `delete-notification`, `delete-notifications`, `get-notifications-stream`, `post-read-all`), which call `notificationsService.*` methods.
- **Re-exported via** `notifications/index.ts`, which in turn is wired by `notifications/module.ts` (NestJS module binding).
- **Wraps** `services/inbox.ts`, `services/stream.ts`, and `services/subscribers.ts` — the actual implementation files.
- **Exercised by** `tests/integration/service.test.ts`, `tests/integration/digest.test.ts`, `tests/integration/events.test.ts`, and `tests/contract/api.contract.test.ts`.

## Notes

- The file header comment states the convention explicitly: *"controllers and siblings call through this, never the bare functions."* Import from this index, not from `./inbox` or `./subscribers` directly.
- The event-handler functions are re-exported individually (not namespaced under a sub-object), so consumers write `notificationsService.onShipmentLost(...)` — easy to miss if you expect them grouped under `notificationsService.subscribers.*`.
- No class or DI decorator is present; it is a plain ES-module object. NestJS DI (if any) is handled at the `module.ts` level, not here.
