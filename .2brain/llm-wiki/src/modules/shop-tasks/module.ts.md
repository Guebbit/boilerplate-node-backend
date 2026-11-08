---
source: src/modules/shop-tasks/module.ts
sha256: 1d3185aee00e34ecf1a438e46bf00962504684b27e1ea537f43ed8674a22890c
generated_at: 2026-11-08T08:15:16.597917+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/module.ts

## Purpose

Module entry point for the shop's helpdesk. Subscribes to domain events emitted by other shop modules and, for each, opens or clears a to-do (task), writes a buyer-facing message or a staff work notice (notification), or both. Also registers the periodic staff-digest jobs, module config, locales, and a single summary route for navigation badges. It owns no data collection itself; `tasks` and `notifications` perform the writes and own their rows.

## Key elements

- **Default export** — an `AppModule` manifest (`satisfies AppModule`) bundling name, route mount, config, jobs, event subscriptions, locales, and templates.
- **`subscribe()`** (inside the export) — registers every `onDomainEvent` handler. Split into three logical groups: to-do open/close pairs, a combined to-do + buyer-message handler (`FULFILLMENT_ORDER_DELAYED`), and pure notification handlers.
- **`shopTasksService`** (from `./services`) — implements every event handler referenced in `subscribe()`.
- **`shopTasksJobs`** (from `./jobs`) — the staff-digest scheduled jobs.
- **`shopTasksConfig`** (from `./config`) — module configuration slice.
- **`router`** (from `./routes`) — single route `GET /shop-tasks/summary`; counts open work items for staff navigation badges.
- **Contract fragments** — `openapi.tasks.yaml`, `openapi.notifications.yaml`, and `asyncapi.notifications.yaml` in this directory extend the public contracts of the `tasks` and `notifications` modules.

## Relationships

- **`src/kernel/events.ts`** — provides `onDomainEvent`, the subscription primitive used throughout `subscribe()`.
- **`src/kernel/registry.ts`** — provides the `AppModule` type that the default export satisfies.
- **`src/modules/cart/index.ts`** — source of `CART_LINES_REMOVED` and `CART_MERGE_REFUSED` events.
- **`src/modules/delivery/index.ts`** — source of `FULFILLMENT_ORDER_CANCELED`, `FULFILLMENT_ORDER_DELAYED`, `FULFILLMENT_ORDER_HOLD_NOTICED`, `SHIPMENT_LOST`, `SHIPMENT_SHIPPED`.
- **`src/modules/inventory/index.ts`** — source of `HOLD_ORPHANED`.
- **`src/modules/orders/index.ts`** — source of `ORDER_CANCELED` and `ORDER_PURCHASE_HOLD_PLACED`.
- **`src/modules/payments/index.ts`** — source of all payment/refund/dispute events (9 events).
- **`src/modules/returns/index.ts`** — source of `RETURN_REQUESTED`.
- **`src/modules/shop-tasks/config.ts`** — provides `shopTasksConfig` (sliced into the manifest).
- **`src/modules/shop-tasks/jobs.ts`** — provides `shopTasksJobs`.
- **`src/modules.ts`** — registers this module in the application's module set.
- **`src/modules/shop-tasks/openapi.tasks.yaml`** / **`openapi.notifications.yaml`** / **`asyncapi.notifications.yaml`** — contract fragments that extend the `tasks` and `notifications` modules' public APIs.

## Notes

- Pure listener: no other module imports this file. Deleting it simply leaves shop events without a handler—no compile-time or runtime break elsewhere.
- `personalData` is declared `'none'` because all row writes (and deletions) are delegated to the `tasks` and `notifications` modules.
- To-do events come in open/close pairs (e.g. `PAYMENT_REFUND_OWED_BY_HAND` → `PAYMENT_REFUNDED`/`PAYMENT_REFUND_CANCELED`); the `FULFILLMENT_ORDER_DELAYED` handler is the one that performs both a task write and a notification write in a single call.
- The module also subscribes to events from `@modules/stock-alerts` (`STOCK_ALERT_SENT`) and `@modules/wishlist` (`WISHLIST_ITEMS_REMOVED`), which are not in the immediate graph neighbor list above.
