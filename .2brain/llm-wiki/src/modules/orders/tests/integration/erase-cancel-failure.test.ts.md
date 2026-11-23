---
source: src/modules/orders/tests/integration/erase-cancel-failure.test.ts
source_sha256: af22298d1a285446013d47c4b1ad8f49f72bcec830e9bc88a1ebeb6d98600fc7
context_sha256: c90c2d2283d26152229c33a22487bd2fb0ce4065baa436214f121b51a9e48a0f
generated_at: 2026-11-22T06:27:22.780663+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/integration/erase-cancel-failure.test.ts

## Purpose
Integration test verifying that when cancelling an erased account's unpaid order fails, the erasure is not undone. The account is still deleted, the order is detached from the user, and the erase call still resolves with success. Per the module doc, the reservation sweep later cancels whatever was missed once its hold times out.

## Key elements
- **`jest.mock('@modules/orders/services/cancel', ...)`**: keeps the real module but replaces `cancelForErasureById` with a function that always rejects with `Error('the write conflicted')`. This simulates a payment racing in or a write conflict.
- **`setupTestDb()`**: sets up the test database.
- **`beforeEach(registerCheckoutModules)`** and **`afterEach(resetDomainEvents)`**: register the checkout modules before each test and reset domain events after each one.
- **Single test** ("still erases the account, detaches the order, and resolves"):
  - Creates a user, a product with `onHand: 10`, and an order with one item.
  - Calls `eraseAsScheduled(user)`.
  - Expects the result to be `true`.
  - Expects `userRepository.findById(user.id)` to resolve to a null value, i.e. the user is gone.
  - Expects the reloaded order to have `userId` undefined and status `OrderStatus.pending`.

## Relationships
- `@tests/setup-test-db` (`tests/support/setup-test-db.ts`): provides `setupTestDb`.
- `@tests/checkout-modules` (`tests/support/checkout-modules.ts`): provides `registerCheckoutModules`.
- `@kernel/events` (`src/kernel/events.ts`): provides `resetDomainEvents`, which clears events between tests.
- `@modules/users/tests/factories`: provides `createUser`, `eraseAsScheduled` and `userRepository`. The `userRepository` export is related to `src/modules/users/repository.ts`.
- `@modules/products/tests/factories`: provides `createProduct`.
- `@modules/orders/tests/factories`: provides `createOrder`, `toOrderItem` and `readOrder`.
- `@types` (`src/types/index.ts`): provides `OrderStatus`.
- `@modules/orders/services/cancel`: the module partially mocked here. Only `cancelForErasureById` is overridden.

## Notes
- The mock only overrides `cancelForErasureById`. Everything else from the cancel module stays real via `jest.requireActual`.
- The order is expected to stay `pending`. It is not cancelled, only detached from the user.
