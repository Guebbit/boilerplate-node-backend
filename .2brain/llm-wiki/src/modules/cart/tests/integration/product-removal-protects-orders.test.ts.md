---
source: src/modules/cart/tests/integration/product-removal-protects-orders.test.ts
sha256: 1cd6acd96305817caa05c05ea70601e96c3d80c63f34b81a2e66799205259235
generated_at: 2026-10-29T03:29:13.057273+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/product-removal-protects-orders.test.ts

## Purpose

Integration test verifying that a product removed, deactivated, or restored *after* an order was placed does not retroactively affect that order: the order stays pending, no cancellation email fires, card and offline payments still succeed, and stock holds persist until explicitly released. Also asserts that a failed product write (simulated DB error) never emits the deletion event, so the cart line and product row survive.

## Key elements

- **`placePendingOrder(product)`** — helper that runs the full real checkout flow (create user → set address → add to cart → set shipping → `orderConfirm`) and returns `{ user, orderId }`. Waits for the confirmation email to land before clearing the mail mock so subsequent assertions only see *post-deletion* emails.
- **`placedMailSent()`** — polls `settleOutboxNudges()` until the mocked `enqueueEmail` has been called at least once.
- **`describe('hard-deleting a product…')`** — three tests: order stays `pending`, no email, stock level row is removed; card `createIntent` still succeeds; offline `recordOfflinePayment` still succeeds and flips order to `paid`.
- **`describe('soft-deleting a product…')`** — order stays `pending`, no email, card payment still works.
- **`describe('deactivating a product…')`** — order stays `pending`, no email, stock hold row persists; card and offline payments still succeed.
- **`describe('a soft delete or a restore')`** — soft delete and subsequent restore both leave the stock level row intact (only hard delete removes it).
- **`describe('a write that fails…')`** — two tests that spy on `productRepository.deleteOne` / `.save` to reject, then assert the cart line is untouched and the product row is unchanged (event never fired).

## Relationships

- **`src/modules/cart/services/index.ts`** — `cartService` drives the real checkout (`setItemById`, `orderConfirm`) and is the module whose `PRODUCT_DELETED` subscriber is under test (it drops cart lines only if the event actually fires).
- **`src/modules/cart/repository.ts`** — `cartRepository` used to read cart state after a failed write and to set shipping method during setup.
- **`src/modules/products/index.ts` / `src/modules/products/services/index.ts`** — `productService.removeById` and `.updateById` are the actions being tested; their real `subscribe()` hooks run against other modules.
- **`src/modules/products/repository.ts`** — `productRepository.deleteOne` / `.save` are spied on to simulate write failures.
- **`src/modules/inventory/tests/factories.ts`** — exposes `stockLevelRepository` to assert level-row existence or absence after hard/soft delete.
- **`src/modules/payments/module.ts`** — `paymentsModule` is registered via `registerCheckoutModules` so its real subscriber runs during checkout.
- **`src/modules/payments/index.ts` / `src/modules/payments/services/index.ts`** — `paymentService.createIntent` and `.recordOfflinePayment` are called post-deletion to prove the order is still payable.
- **`src/modules/orders/tests/factories.ts`** — `readOrder` fetches order state for assertions.
- **`src/modules/addresses/tests/factories.ts`** — `giveAddress` supplies the required shipping address for checkout.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges()` flushes the outbox so domain-event side-effects (emails) are observable.
- **`src/kernel/events.ts`** — `resetDomainEvents()` in `afterEach` prevents event-handler state leaking between tests.
- **`src/infrastructure/adapters/mailer.ts`** — `enqueueEmail` is fully mocked; call-count assertions are the primary "no email" check.

## Notes

- The file intentionally exercises **real cross-module subscribers** (products → inventory, products → cart, products → orders/payments) rather than mocking them, making it a true integration test of the event-driven contract.
- `mockEnqueueEmail.mockClear()` is called *after* `placedMailSent()` inside `placePendingOrder` so that all email assertions in the test body only see emails triggered by the post-deletion action.
- The "failed write" tests rely on the implementation detail that `productService` emits its domain event **after** the repository write succeeds; if that ordering changes, these tests will pass incorrectly (or the service will need a different failure boundary).
- `registerCheckoutModules([paymentsModule])` is called in `beforeEach` — without it, checkout would refuse the order because no payment provider is registered.
