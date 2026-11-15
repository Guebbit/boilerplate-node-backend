---
source: src/modules/shop-tasks/tests/integration/notices.test.ts
sha256: 5722dd475066ee676bd0edaca02e1ea227fff345c3a597c3f9baf5f5a1a1fcc7
generated_at: 2026-11-14T21:56:29.146122+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/tests/integration/notices.test.ts

## Purpose

Integration tests that verify which notifications land in a buyer's inbox for each shop-task event (product deletion, cart merge refusal, stock-alert fulfillment, preorder delay, order hold, shipment loss). The tests drive the system exactly as production does—real modules registered, real service calls at one end, inbox assertions at the other—so the subscription wiring in `shop-tasks/module.ts` itself is under test rather than bypassed.

## Key elements

- **`heldFor(userId)`** – builds a `fulfillment_order.hold_noticed` domain-event payload; omits `userId` to simulate an erased account.
- **`inboxOf(userId)`** – thin wrapper over `notificationsService.list(userId)` returning the `items` array, newest first.
- **`lostFor(userId)`** – builds a `shipment.lost` domain-event payload with line items, owed items, and expected replacement date.
- **`moved(days)`** (inside the late-preorder describe block) – creates a paid preorder 30 days out, generates its fulfillment orders, then shifts the product's `releaseDate` to `days` days out; returns the placed order for assertions.
- **`beforeEach`** – calls `resetDomainEvents()` then `registerModules(enabledModules)` so every test starts from a clean, fully wired module registry.
- **Test suites** – one `describe` per event type: *deleted product* (hard/soft, cart + wishlist, bystander isolation), *guest-cart merge* (refused lines, sold-out, quantity change, clean merge), *hard-deleted user*, *back-in-stock request*, *late preorder* (delayed / earlier-date / same-date), plus top-level tests for order holds and lost shipments.

## Relationships

- **`src/kernel/events.ts`** – `resetDomainEvents()` clears the event bus between tests; `emitDomainEvent` is what the real modules call internally to publish domain events.
- **`src/kernel/outbox.ts`** – `settleOutboxNudges()` is called after every triggering action to drain the outbox so notifications are persisted before assertions.
- **`src/kernel/registry.ts`** – `registerModules(enabledModules)` wires the production module graph; no subscribers are mocked.
- **`src/modules.ts`** – provides the `enabledModules` array that defines which modules are active in this test environment.
- **`src/modules/products/services/index.ts`** – the product service is the trigger surface: its remove and update methods are the actions that fire the deletion and date-change events under test.
- **`src/modules/products/tests/factories.ts`** – `createProduct` builds the product fixtures each suite needs.
- **`src/modules/cart/services/index.ts`** – the cart service sets up cart state and triggers the merge-refusal path; `addItemById` and `merge` are the entry points exercised here.
- **`src/modules/inventory/services/index.ts`** – the inventory service's receive action restocks a product to trigger the buyable-again / stock-alert flow.
- **`src/modules/notifications/services/index.ts`** – the primary assertion surface; `inboxOf` delegates to this service's list method.
- **`src/modules/notifications/tests/factories.ts`** – provides `countNotifications` for auxiliary inbox assertions.
- **`src/modules/delivery/tests/factories.ts`** – `paidPreorderOrder` and `fulfillmentOrdersOf` build the preorder and fulfillment-order fixtures for the late-preorder suite.

## Notes

- Every assertion on inbox content is preceded by `settleOutboxNudges()`; omitting it will cause flaky "empty inbox" failures because the outbox is asynchronous.
- Tests intentionally do **not** mock any subscriber or call a handler directly—the point is to verify the `module.ts` subscription wiring end-to-end.
- The cart-merge-refused test asserts the exact shape of `params` (`Object.keys(params)` equals `['lines']`) to pin down that no extra fields (reason, quantity) leak into the notification contract.
- `setupTestDb()` is called once at module scope; the per-test isolation relies on `resetDomainEvents` + fresh rows rather than a transaction rollback.
