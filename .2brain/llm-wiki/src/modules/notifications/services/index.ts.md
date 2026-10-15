---
source: src/modules/notifications/services/index.ts
sha256: 4e06c1534ac14d0d07c83b2e281c1facecfbdf1cf12a752c75723a2af7bd63db
generated_at: 2026-10-15T10:51:40.111755+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/services/index.ts

## Purpose

Barrel file and service facade for the notifications module. It re-exports the individual service functions (`inbox`, `stream`, `subscribers`) and additionally bundles the inbox CRUD operations into a single `notificationsService` object. Controllers and sibling modules import from here rather than reaching into the individual implementation files directly.

## Key elements

- **Re-exports from `./inbox`** — `notificationsList`, `notificationsCreate`, `notificationDelete`, `notificationsDismissAll`, `notificationsReadAll`, `notificationsDeleteByUserId`: the core read/write operations on notification rows.
- **Re-exports from `./subscribers`** — `onCartLinesRemoved`, `onWishlistItemsRemoved`, `onCartMergeRefused`, `onFulfillmentOrderDelayed`: domain-event handlers that translate events into notification rows.
- **Re-exports from `./stream`** — `streamNotifications`, `publishToUser`, `openStreamCount`: live-delivery (SSE/WebSocket) primitives for pushing notifications to connected clients.
- **`notificationsService` (exported const)** — an object literal whose properties point at the same inbox functions. The file's doc comment states this is "the service's public surface — controllers call through this, never the bare functions."

## Relationships

- **Controllers** (`delete-notification.ts`, `get-notifications.ts`, `get-notifications-stream.ts`, `post-dismiss-all.ts`, `post-read-all.ts`) import `notificationsService` (or the individual stream/subscriber exports) from this file to perform their work.
- **`src/modules/notifications/index.ts`** re-exports this module's surface outward to the rest of the application.
- **`src/modules/notifications/module.ts`** wires the module together; the subscriber functions exported here are likely registered as event listeners during bootstrap.
- **`services/inbox.ts`, `services/stream.ts`, `services/subscribers.ts`** are the actual implementations whose functions are re-exported (or wrapped) here.
- **Tests** (`service.test.ts`, `api.contract.test.ts`, `events.test.ts`, `get-notifications-stream.test.ts`) exercise the exports defined in this file.

## Notes

- There are two ways to call inbox functions: the bare named exports (e.g. `import { notificationsList } from '…/services/index'`) *or* via the `notificationsService` object. The convention, per the in-file comment, is that controllers use `notificationsService.*` exclusively.
- The subscriber and stream exports are **not** part of the `notificationsService` object; they are consumed by different callers (event bus / stream infrastructure) and are only re-exported here for convenience.
