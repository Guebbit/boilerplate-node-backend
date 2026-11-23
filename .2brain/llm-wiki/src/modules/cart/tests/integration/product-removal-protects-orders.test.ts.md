---
source: src/modules/cart/tests/integration/product-removal-protects-orders.test.ts
generated_at: 2026-11-22T04:41:23.602721+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/tests/integration/product-removal-protects-orders.test.ts

## Purpose
Integration test suite asserting that removing or deactivating a product *after* an order was placed does not disturb that order. A pending order stays `pending`, no email is sent, and card or offline payment still succeeds. It also checks that `inventory` drops the stock-level row only on a hard delete, and that a failed write never announces the deletion. It lives under `cart` because checkout is where the protected order is placed, and every module involved is one `cart` depends on, so their real `subscribe()` hooks run.

## Key elements
- **`jest.mock` of `@infrastructure/adapters/mailer`**: replaces `enqueueEmail` with `mockEnqueueEmail`, so cases can assert which mail was enqueued.
- **`placedMailSent()`**: polls with `eventually`, settling outbox nudges until the placed-order mail (carried by `order.created` through the outbox relay) lands on the mock.
- **`placePendingOrder(product)`**: creates a user and address, adds one unit to the cart, sets shipping to `pickup`, and runs the real `cartService.orderConfirm`. It then waits for the placement email and clears the mock, so later assertions only see post-removal mail. It returns `{ user, orderId }`.
- **Setup/teardown**: `setupTestDb()`, `registerCheckoutModules([paymentsModule])` and `mockEnqueueEmail.mockClear()` before each test. `resetDomainEvents()` and `jest.restoreAllMocks()` after each.
- **Test groups**:
  - *Hard delete* (`productService.removeById(id, true)`): the level row is removed (`stockLevelRepository.findByProductId` resolves to a null value). The order stays `pending` with no email. `paymentService.createIntent` and `recordOfflinePayment` (order becomes `paid`) still succeed.
  - *Soft delete* (`removeById(id, false)`): the order stays pending and card-payable, with no email.
  - *Deactivation* (`updateById(id, { active: false })`): the order stays pending, its stock hold remains, and card and offline payment still work.
  - *Soft delete / restore*: the level row is left alone throughout.
  - *Failed writes*: `productRepository.deleteOne` or `save` is mocked to reject once. `removeById` rejects with `mongo is down`, the cart line stays, and the product row is unchanged (for a soft delete, `deletedAt` stays unset).

## Relationships
- **`@infrastructure/adapters/mailer`**: mocked; the tests assert on `enqueueEmail` calls.
- **`@kernel/outbox`**: `settleOutboxNudges` flushes the event relay so subscribers have run before assertions.
- **`@kernel/events`**: `resetDomainEvents` clears listeners between tests.
- **`cart` services and repository**: `cartService.orderConfirm` drives checkout, and `cartRepository.findByUserId` inspects the cart after failed writes.
- **`products`**: `productService` (`removeById`, `updateById`, `restoreById`) is the system under test, with `productRepository` spied on for failure injection.
- **`inventory`**: `stockLevelRepository` verifies the level row's presence or absence.
- **`payments`**: `paymentsModule` is registered for checkout, and `paymentService` is used to attempt payment.
- **Test factories**: `addresses`, `users`, `products` and `orders` factories supply `giveAddress`, `createUser`, `createProduct`/`readProduct` and `readOrder`.
- **Shared test helpers**: `@tests/setup-test-db`, `@tests/callers`, `@tests/eventually` and `@tests/checkout-modules`.

## Notes
- Because the placement email is awaited and then cleared, `expect(mockEnqueueEmail).not.toHaveBeenCalled()` only reflects mail triggered after the removal or deactivation.
- Hard-delete tests re-read the product with `readProduct` before calling `removeById`.
- The failure tests rely on the event being emitted only after the repository write succeeds. `cart`'s own `PRODUCT_DELETED` listener drops the line unconditionally, so a surviving cart line shows the event never fired.
