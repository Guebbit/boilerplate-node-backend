---
source: src/modules/notifications/tests/integration/events.test.ts
sha256: 4b32f0f8c9d27888c3023f9066b1bba045a32fa3fb3bd04d1aee91b8207d67f4
generated_at: 2026-10-29T04:32:52.113938+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/tests/integration/events.test.ts

## Purpose

Integration tests that verify the full domain-event → subscription → inbox-notification pipeline by registering **real** modules and triggering real service calls (product deletion, cart merge, stock receive, release-date update). The module doc comment is explicit: no subscriber is called directly — the wiring registered by `registerModules` is itself under test.

## Key elements

- **`heldFor(userId?)`** – builds a `fulfillment_order.hold_noticed` fact (used in delivery-related scenarios).
- **`lostFor(userId?)`** – builds a `shipment.lost` fact.
- **`inboxOf(userId)`** – wraps `notificationsService.list` to return just the `items` array, newest first.
- **`moved(days)`** – creates a paid preorder, builds its fulfillment orders, then shifts the product's `releaseDate`; returns the placed order. Used by the "late preorder" block.
- **`describe('a deleted product')`** – hard-delete and soft-delete paths; verifies cart owners, wishlist owners, and dual-list owners receive the correct `notifications.*` codes; verifies bystanders get nothing.
- **`describe('a guest-cart merge')`** – verifies a single `notifications.cart-merge-refused` message for fully-refused lines, and silence for sold-out or partially-clamped lines.
- **`describe('a back-in-stock request')`** – verifies `notifications.stock-alert` is written once when inventory is received and the alert fires.
- **`describe('a late preorder')`** – verifies `notifications.fulfillment-delayed` with `severity: 'warning'` when `releaseDate` moves later.
- **`beforeEach`** – calls `resetDomainEvents()` then `registerModules(enabledModules)` to rebuild the real subscription graph per test.

## Relationships

- **`src/kernel/events.ts`** – imports `emitDomainEvent` and `resetDomainEvents`; the event bus whose emission is the trigger under test.
- **`src/kernel/outbox.ts`** – imports `settleOutboxNudges`; called after every triggering action to flush outbox rows into inbox rows before asserting.
- **`src/kernel/registry.ts`** – imports `registerModules`; the mechanism that wires module subscriptions (the part being tested).
- **`src/modules.ts`** – imports `enabledModules`, the list passed to `registerModules`.
- **`src/modules/products/index.ts` / `services/index.ts`** – `productService.removeById` and `productService.updateById` are the actions that emit `product.deleted` / `product.updated` events.
- **`src/modules/products/tests/factories.ts`** – `createProduct` builds the products used as event subjects.
- **`src/modules/cart/index.ts` / `services/index.ts`** – `cartService.addItemById` and `cartService.merge` emit cart events and produce the "guest-cart merge" scenario.
- **`src/modules/inventory/index.ts` / `services/index.ts`** – `inventoryService.receive` triggers the stock-in event consumed by the stock-alert subscription.
- **`src/modules/stock-alerts/index.ts`** – `stockAlertService.onBuyableAgain` is the subscriber action that leads to the `notifications.stock-alert` inbox row.
- **`src/modules/delivery/tests/factories.ts`** – `paidPreorderOrder` and `fulfillmentOrdersOf` set up the preorder scenario.
- **`src/modules/notifications/model.ts`** – `notificationModel` is the persisted entity the tests ultimately assert against.
- **`src/modules/notifications/services/index.ts`** – `notificationsService.list` is how tests read the inbox.

## Notes

- Tests call `settleOutboxNudges()` after every triggering action **and** after any intermediate soft-delete; forgetting this leaves rows in the outbox rather than the inbox, causing false-negative assertions.
- The "guest-cart merge" test explicitly asserts `Object.keys(message?.params).toEqual(['lines'])` to lock down the contract shape of `CartMergeRefusedParams` — no extra keys are permitted.
- `beforeEach` re-registers modules each test; this means subscription state is not shared across tests, but any module that caches listeners across registrations would break here.
- The file imports `notificationModel` from `../../model` but the visible test bodies assert via `notificationsService.list`; the model import may support type-level assertions or is a remnant worth watching for drift.
