---
source: src/modules/cart/tests/integration/service.test.ts
source_sha256: 51d1b5f519130a2809f4caf8d47f5c13c0ce26e82c622d156de566a25eed2c9d
context_sha256: ab8e0a33b71bfe2936d3e50fbeaa8cbb30aecf985c26596145b9583892f1c741
generated_at: 2026-11-22T04:41:53.481267+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/tests/integration/service.test.ts

## Purpose
Integration tests for the cart service (`src/modules/cart/services/`), run against a real Mongo instance via `setupTestDb()`. The file's header names its highest-risk seam: `set` and `add` share one private `upsertCartItem`, differing only in `$set` vs `$inc` on one repository line, so a collapsed mutation would silently multiply or drop a user's quantity. It also pins the over-serialization guard on the cart view and the rule that a cart is a per-user document with no per-line `_id`. Real Mongo is used because the behavior lives in `cartRepository.upsertLine`'s guarded writes, which a mock can't exercise.

## Key elements
- **`jest.mock('@infrastructure/adapters/mailer')`** replaces `enqueueEmail` with `mockEnqueueEmail`, so cases assert which mail was *dispatched*, not its copy (the mailer template suite pins that).
- **`mailQueued()`** waits via `eventually` and `settleOutboxNudges` until the mock has been called. This covers mail sent from an outbox-event listener after commit.
- **`EMPTY_CART`** is the expected view for a user with no cart. It has an empty `items` list, a zeroed EUR `summary`, `checkoutable: false`, and `shipping: { required: false, options: [] }`.
- **`storedQuantity(userId, productId)`** reads the persisted line quantity through `cartRepository.findByUserId`.
- **`atDefault(body)` / `atHardCap(body)`** use `withEnvironmentOverrides` to pin `NODE_CART_LINE_MAX_QUANTITY` to `'10'` or `'999'`, so a developer's `.env` can't affect the results.
- **`giveUserAnAddress(userId)`** creates a default address via `addressService`. `standard` and `express` shipping require one.
- **`buyerReadyToCheckOut()`** builds a user with an address and a product in the cart, with the `pickup` shipping method set, so only a hold can refuse checkout.
- **`onHoldAtTheCap()`** builds a ready buyer with two pending card orders and a moderator-set purchase hold.
- **Visible suites:**
  - `cart storage`: no document before the first write, creation on first add, `createdAt` stamped through the upsert, lines stored as `{productId, quantity}` with no `_id`, one cart per user, `updatedAt` refreshed on write.
  - `get`: an empty list for a new or missing user, populated product on each line, and a deleted product keeps its `productId` while `product` is `null`.
  - `getForBadge`: the populated product is dropped, so each line has exactly the keys `productId`, `quantity`, `availability` and `canIncrease`. A summary test follows.

## Relationships
- Drives `cartService` (`modules/cart/services`) and inspects state directly through `cartRepository` (`modules/cart/repository`), including `findByUserId`, `count` and `setShippingMethod`.
- Uses `addressService` (`modules/addresses`) to give users addresses. It also uses `productService` and the `PRODUCT_DELETED` event from `modules/products`.
- `@kernel/registry` (`registerModules`), `@kernel/events` (`resetDomainEvents`, `emitDomainEvent`) and `@kernel/outbox` (`settleOutboxNudges`) are imported, along with `cartModule` from `modules/cart/module` and `registerCheckoutModules`. These point to cart module registration and event-driven cases further down the file.
- Mocks `@infrastructure/adapters/mailer`. `@infrastructure/adapters/logger` and `@infrastructure/i18n` (`t`) are imported for assertions in later cases.
- `modules/orders/tests/factories` provides `createOrder`, `toOrderItem`, `countOrders` and `findOrder`. Other factories come from the users and products test modules, and helpers from `@tests/*`.

## Notes
- The mailer mock is declared above the `@modules/...` imports in the file, so Jest's hoisting of `jest.mock` is relied on.
- Absence of a cart document and an empty cart are the same state. Reads return an empty list or `EMPTY_CART` instead of throwing, even for a nonexistent user.
- `cartService.get` returns lines with the populated `product`, which prices the cart. `getForBadge` must not include it, because `CartResponseItem` is `additionalProperties: false`.
- The cart is created by an upsert, not `create()`, so the `createdAt` test checks that `timestamps` reaches the insert branch.
