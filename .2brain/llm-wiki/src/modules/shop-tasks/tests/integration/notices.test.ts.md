---
source: src/modules/shop-tasks/tests/integration/notices.test.ts
sha256: 32734130e7b96af0b9a1ad1d44ed79f41ad7d67a610bd07c51ef42e05cd05a5a
generated_at: 2026-11-08T08:18:44.109573+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/tests/integration/notices.test.ts

## Purpose

Integration test suite that verifies each shop domain event produces the correct buyer-facing notification in the inbox. It exercises the full production wiring—module registration, domain-event emission, outbox settlement, and notification delivery—without calling any subscriber directly, so the subscription wiring in the module entry-point is itself under test.

## Key elements

- **`heldFor(userId?)`** – Builds a `fulfillment_order.hold_noticed` fact payload for fixture assertions.
- **`lostFor(userId?)`** – Builds a `shipment.lost` fact payload for fixture assertions.
- **`inboxOf(userId)`** – Fetches a user's notification list (newest-first) via `notificationsService.list`.
- **`moved(days)`** (inner helper) – Creates a paid preorder with fulfillment orders, then shifts the product's release date to *days* from now and settles the outbox.
- **`describe('a deleted product')`** – Verifies cart-line and wishlist notifications on hard and soft product deletion, including the dual-notification case and the no-op case.
- **`describe('a guest-cart merge')`** – Verifies the single `cart-merge-refused` notification lists only fully-refused lines, and that partially-accepted or fully-accepted merges produce no notification.
- **Hard-deleted user test** – Confirms that removing a user erases their inbox.
- **`describe('a back-in-stock request')`** – Verifies the `stock-alert` notification fires after `inventoryService.receive` + `stockAlertService.onBuyableAgain`.
- **`describe('a late preorder')`** – Verifies the `fulfillment-delayed` notification carries the shifted date and product title.

## Relationships

- **`src/modules.ts`** – Provides `enabledModules`, the array passed to `registerModules` in `beforeEach`.
- **`src/kernel/registry.ts`** – `registerModules` wires all enabled modules (including shop-tasks) so their event subscriptions are active.
- **`src/kernel/events.ts`** – `resetDomainEvents` clears the event bus between tests; `emitDomainEvent` is imported for potential direct emission in untruncated sections.
- **`src/kernel/outbox.ts`** – `settleOutboxNudges` flushes queued async notification writes after each domain action.
- **`src/modules/products/index.ts` / `services/index.ts`** – `productService` drives deletions and release-date updates that trigger the events under test.
- **`src/modules/products/tests/factories.ts`** – `createProduct` seeds products with specific titles, stock, and release dates.
- **`src/modules/cart/index.ts` / `services/index.ts`** – `cartService.addItemById` and `cartService.merge` create the cart state whose removal/merge produces notifications.
- **`src/modules/notifications/index.ts` / `services/index.ts`** – `notificationsService.list` is the assertion target (the buyer's inbox).
- **`src/modules/notifications/tests/factories.ts`** – `countNotifications` imported for potential inbox-size assertions.
- **`src/modules/delivery/tests/factories.ts`** – `paidPreorderOrder` and `fulfillmentOrdersOf` set up preorder and fulfillment-order rows.
- **`src/modules/inventory/index.ts` / `services/index.ts`** – `inventoryService.receive` triggers the back-in-stock flow.

## Notes

- The test suite deliberately avoids calling subscribers directly; the module's `module.ts` wiring is part of what is asserted. If a subscription is removed or misnamed, these tests will fail.
- `settleOutboxNudges()` must be called after every domain action that enqueues a notification—forgetting it silently yields empty inboxes.
- The guest-cart merge test explicitly locks the params contract: only the `lines` key is expected (`Object.keys(params)` assertion), guarding against accidental extra fields.
- `countNotifications` is imported but not used in the visible (truncated) portion; it may appear in later test blocks.
- The file is truncated in the source view; the "late preorder" describe block continues beyond what is shown.
