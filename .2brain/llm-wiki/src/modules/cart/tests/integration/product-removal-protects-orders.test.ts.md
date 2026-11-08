---
source: src/modules/cart/tests/integration/product-removal-protects-orders.test.ts
sha256: 1cd6acd96305817caa05c05ea70601e96c3d80c63f34b81a2e66799205259235
generated_at: 2026-11-08T05:22:11.467882+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/product-removal-protects-orders.test.ts

## Purpose

Integration test verifying that a product removed (hard or soft) or deactivated *after* an order is placed does not invalidate that order. Confirms the order stays `pending`, card/offline payments still succeed, no spurious emails fire, and inventory level rows are cleaned up (hard delete only) or preserved (soft delete / deactivation). Also guards that a failed write never emits the `PRODUCT_DELETED` event.

## Key elements

- **`placePendingOrder(product)`** – Runs the full real checkout (cart → shipping → `orderConfirm`) to produce a pending order for one unit of the given product. Waits for the confirmation email to land on the mocked mailer, then clears the mock so later assertions only see post-deletion effects.
- **`placedMailSent()`** – Polls via `eventually` + `settleOutboxNudges` until the mocked `enqueueEmail` has been called (the `order.created` email riding the outbox relay).
- **`describe('hard-deleting…')`** – Three tests: order stays pending with no email; `paymentService.createIntent` still succeeds; `recordOfflinePayment` still succeeds and flips order to `paid`. Asserts `stockLevelRepository.findByProductId` resolves to `null` (level row deleted).
- **`describe('soft-deleting…')`** – Order stays pending, no email, card payment still works.
- **`describe('deactivating…')`** – Order stays pending, stock hold retained (level row non-null), card and offline payments still work.
- **`describe('a soft delete or a restore')`** – Level row survives soft delete and restore; only hard delete removes it.
- **`describe('a write that fails…')`** – Spies on `productRepository.deleteOne` / `.save` to reject; asserts the event never fired (cart line intact) and the DB row is unchanged.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/cart/services/index.ts` | `cartService.setItemById`, `cartService.orderConfirm` drive the real checkout. |
| `src/modules/cart/repository.ts` | `cartRepository.setShippingMethod`, `cartRepository.findByUserId` for setup and post-failure assertions. |
| `src/modules/products/services/index.ts` | `productService.removeById`, `.updateById`, `.restoreById` trigger the deletion/deactivation under test. |
| `src/modules/products/repository.ts` | `productRepository` spied on (`deleteOne`, `save`) to simulate write failures. |
| `src/modules/products/index.ts` | Re-export source for `productService` import. |
| `src/modules/inventory/tests/factories.ts` | `stockLevelRepository.findByProductId` asserts level-row lifecycle. |
| `src/modules/orders/tests/factories.ts` | `readOrder` reads order status after each scenario. |
| `src/modules/payments/module.ts` | Registered via `registerCheckoutModules` so its real `subscribe()` hooks fire. |
| `src/modules/payments/index.ts` | `paymentService.createIntent` / `.recordOfflinePayment` exercise the payment path. |
| `src/infrastructure/adapters/mailer.ts` | `enqueueEmail` is mocked; call-count assertions gate "no spurious email" checks. |
| `src/kernel/events.ts` | `resetDomainEvents` in `afterEach` clears subscriber state between tests. |
| `src/kernel/outbox.ts` | `settleOutboxNudges` flushes queued outbox messages so event-driven side effects (email) complete. |
| `src/modules/addresses/tests/factories.ts` | `giveAddress` satisfies the checkout pre-condition. |

## Notes

- This is a true **integration** test: all `subscribe()` hooks from cart, products, inventory, orders, and payments run for real. Only the mailer is mocked.
- `placedMailSent()` is awaited **before** clearing the mock in `placePendingOrder`, ensuring the confirmation email is not conflated with any (incorrect) post-deletion email.
- The failed-write tests confirm that domain events are emitted **after** the repository write succeeds — a write-level invariant of the products service.
- `registerCheckoutModules([paymentsModule])` in `beforeEach` wires the payments subscriber; without it, `orderConfirm` would reject because the payments module is not registered.
