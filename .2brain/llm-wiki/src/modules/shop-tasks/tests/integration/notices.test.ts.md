---
source: src/modules/shop-tasks/tests/integration/notices.test.ts
source_sha256: 38b1f30e0fa078761317b8a73e9b9acfac20bfd339ee220d149ec71132bc08a9
context_sha256: 011baf9febab90579cdbe77f8dbe01e449c1432bd8ae5c20405781dfdcfffc9b
generated_at: 2026-11-22T07:45:01.151300+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/shop-tasks/tests/integration/notices.test.ts

## Purpose
Integration test suite verifying what each shop event becomes in a buyer's inbox (notifications). It runs the way production does: real modules are registered via `registerModules(enabledModules)`, a real trigger (product deletion, cart merge, stock sweep, preorder date change) fires at one end, and the resulting notification rows are read at the other. No subscriber is called directly, so the wiring in `module.ts` is itself under test.

## Key elements
- `heldFor(userId)` / `lostFor(userId)`: builders for `fulfillment_order.hold_noticed` and `shipment.lost` event payloads. `userId` is omitted when undefined, which models an erased account.
- `inboxOf(userId)`: returns a user's notification items, newest first, via `notificationsService.list`.
- `describe('the module subscriptions')`: the root suite. Its `beforeEach` calls `resetDomainEvents()` and then `registerModules(enabledModules)`.
- **Deleted product** cases:
  - Cart owners get one `shop-tasks.cart-line-removed` warning, with `productId` and `titles` in its params. Bystanders get nothing.
  - Wishlist owners get `shop-tasks.wishlist-item-removed`.
  - A user who held the product in both lists gets both messages.
  - Soft deletes notify too.
  - Nothing is written when no list held the product.
- **Guest-cart merge** cases:
  - One `shop-tasks.cart-merge-refused` message lists only lines that could not be added at all, with `requested` and `titles` per line.
  - Its params contain only `lines`.
  - Nothing is written for sold-out products, lines that landed with a different quantity, or fully successful merges.
- **Hard-deleted user**: the user's inbox is gone after `userService.removeById(..., true, ...)`.
- **Back-in-stock request**: after stock is received and `stockAlertService.sweepBuyable()` runs, the asker gets one `shop-tasks.stock-alert` message. The alert is created through the `POST /stock-alerts` HTTP API.
- **Late preorder**: the `moved(days)` helper places a paid preorder, creates its fulfillment orders and moves the product's `releaseDate`. A later date produces `shop-tasks.fulfillment-delayed` (severity `warning`) for the buyer. The visible portion of the file ends partway through this case.

## Relationships
- `@kernel/registry` (`registerModules`) and `src/modules.ts` (`enabledModules`) provide the real module wiring.
- `@kernel/events` (`resetDomainEvents`, `emitDomainEvent`) clears subscribers between tests.
- `@kernel/outbox` (`settleOutboxNudges`) is awaited after most triggers so deferred outbox work completes before assertions.
- The `products` module (`productService`, `createProduct` factory) triggers deletions and release-date changes.
- The `cart` module (`cartService`) supplies cart contents and `merge`.
- The `inventory` module (`inventoryService`) is used to restock products in the back-in-stock case.
- The `notifications` module (`notificationsService`, plus `countNotifications` from its test factories) is where results are read.
- `delivery/tests/factories` (`paidPreorderOrder`, `fulfillmentOrdersOf`) builds the preorder scenarios.
- The `wishlist`, `stock-alerts`, `users`, `shop` and `@tests/*` helpers are also used.

## Notes
- Cases that go through the outbox call `settleOutboxNudges()` before asserting. The merge-refused tests read the inbox immediately after `cartService.merge`.
- A sold-out product is deliberately not reported on merge, because the line was added and a stock-out is temporary.
- Codes are namespaced `shop-tasks.*`.
