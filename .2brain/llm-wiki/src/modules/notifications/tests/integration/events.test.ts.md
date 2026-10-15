---
source: src/modules/notifications/tests/integration/events.test.ts
sha256: 81cff46ed4feded7fab1dd69207a009e42912bb16f89852eb7e303b53ed205a3
generated_at: 2026-10-15T10:52:48.895678+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/tests/integration/events.test.ts

## Purpose

Integration test that verifies the **module wiring** in the notifications module (and the cart, wishlist, products, and delivery modules that emit the relevant domain events) produces the correct inbox rows. Nothing here calls a subscriber directly; the real modules are registered via the kernel registry, real services drive the domain actions, and the assertions inspect the resulting `notification` documents.

## Key elements

- **`inboxOf(userId)`** – helper that wraps `notificationsService.notificationsList` and returns the items array (newest first).
- **`describe('the module subscriptions')`** – root suite; `beforeEach` calls `resetDomainEvents()` then `registerModules(enabledModules)`.
- **`describe('a deleted product')`** – five cases covering: cart-owner notification, wishlist-owner notification, both simultaneously, soft-delete notification, and the no-holder no-op.
- **`describe('a guest-cart merge')`** – four cases covering: one consolidated `cart-merge-refused` row listing all refused lines, sold-out (no notification), quantity-capped (no notification), and fully-added (no notification).
- **`it('a hard-deleted user takes their inbox with them')`** – verifies `userService.removeById` cascades to delete notification rows.
- **`describe('a late preorder')`** – uses the `moved(days)` helper (from delivery factories + `productService.updateById`) to shift a preorder release date; asserts `preorder-delayed` for a short slip, `preorder-confirm-wait` for a long slip, zero rows for an erased buyer, and no row when the date moves *earlier*.

## Relationships

- **`src/kernel/registry.ts`** – `registerModules(enabledModules)` wires all real modules into the event bus before each test.
- **`src/kernel/events.ts`** – `resetDomainEvents()` clears the bus between tests; `emitDomainEvent` is used in the erased-buyer preorder case to simulate the event without a live product.
- **`src/kernel/outbox.ts`** – `settleOutboxNudges()` flushes the async outbox so notification writes are observable before assertions.
- **`src/modules.ts`** – supplies the `enabledModules` array that the registry receives.
- **`src/modules/products/index.ts`** / **`src/modules/products/services/index.ts`** – `productService.removeById` and `productService.updateById` are the domain actions that emit the events under test.
- **`src/modules/cart/index.ts`** / **`src/modules/cart/services/index.ts`** – `cartService.cartItemAddById` and `cartService.cartMerge` create the state that product-deletion and merge-refusal events depend on.
- **`src/modules/wishlist/index.ts`** – `wishlistService.wishlistAdd` creates wishlist entries so the wishlist subscriber can react to product deletion.
- **`src/modules/users/index.ts`** / **`src/modules/users/services/index.ts`** – `userService.removeById` is the cascade trigger for the inbox-deletion test.
- **`src/modules/notifications/services/index.ts`** – `notificationsService.notificationsList` is the read side the assertions inspect.
- **`src/modules/users/tests/factories.ts`** – `createUser` seeds test users.
- **`src/modules/products/tests/factories.ts`** – `createProduct` seeds products with configurable `onHand`, `releaseDate`, etc.
- **`src/modules/delivery/tests/factories.ts`** – `paidPreorderOrder` and `fulfillmentOrdersOf` build a complete preorder fixture for the late-preorder suite.

## Notes

- The test deliberately avoids importing or calling any subscriber function from `src/modules/notifications`; correctness of the `module.ts` wiring *is* the thing under test.
- `settleOutboxNudges()` must be awaited after every domain action that may produce a notification; forgetting it makes assertions race against the async outbox.
- A soft delete (`removeById(id, false)`) **does** trigger cart/wishlist notifications, but a sold-out product (`onHand: 0`) during a cart merge does **not**—the test codifies that distinction.
- The erased-buyer preorder case asserts on `notificationModel.countDocuments({})` directly (not `inboxOf`) because the user no longer exists to query through the service.
- The cart-merge-refused assertion pins the exact `params` keys to `['lines']` to guard against future param leakage.
