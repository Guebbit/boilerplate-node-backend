---
source: tests/integration/product-removal-protects-orders.test.ts
sha256: 3d754e42f899edbce4e768f0d260c3dee3ef94aa3c3ffd3cd03ece9606aaecc9
generated_at: 2026-10-15T12:51:17.892739+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/product-removal-protects-orders.test.ts

## Purpose

Cross-module integration test that verifies a product removed, soft-deleted, or deactivated **after** an order has been placed does not disrupt that order: it stays `pending`, remains payable by card or offline method, triggers no cancellation email, and (for soft-delete/restore/deactivation) retains its inventory level row. Also asserts that a failed write on the product does **not** emit the `PRODUCT_DELETED` domain event, leaving the buyer's cart intact. Lives in `tests/integration/` (not a single module's `tests/`) because it exercises the real `subscribe()` hooks of `products`, `inventory`, `orders`, `payments`, and `cart` simultaneously.

## Key elements

- **`placePendingOrder(product)`** – Shared helper: creates a user, adds the product to the cart, sets a shipping method, and runs the real `orderConfirm` checkout. Calls `flush()` then clears the mailer mock so later assertions only see post-removal effects.
- **`flush()`** – Resolves after `setImmediate`, letting the fire-and-forget `sendOrderPlacedEmail` chain land its `enqueueEmail` call before the mock is cleared.
- **`describe('hard-deleting a product…')`** – 3 tests: level row is dropped, order stays `pending`, no email; card intent still succeeds; offline payment still succeeds.
- **`describe('soft-deleting a product…')`** – 1 test: order stays pending/payable, no email.
- **`describe('deactivating a product…')`** – 3 tests: order stays pending, stock hold retained, no email; card and offline payments still succeed.
- **`describe('a soft delete or a restore')`** – Confirms the inventory level row survives both a soft delete and a subsequent restore (only hard delete removes it).
- **`describe('a write that fails…')`** – 2 tests: spies on `productRepository.deleteOne` (hard) or `.save` (soft) to force a rejection; asserts the cart line is untouched and the product row still exists (or `deletedAt` is unset), proving the event was never emitted.
- **`jest.mock('@infrastructure/adapters/mailer')`** – Replaces `enqueueEmail` with a jest mock; all "no email" assertions target `mockEnqueueEmail`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure/adapters/mailer.ts` | `enqueueEmail` is fully mocked; tests assert it was **not** called post-removal. |
| `src/kernel/events.ts` | `resetDomainEvents()` in `afterEach` clears the in-process event bus between tests. |
| `src/kernel/outbox.ts` | `settleOutboxNudges()` awaits all pending outbox-driven subscriber runs so assertions see final state. |
| `src/modules/products/index.ts` | `productService.remove()` and `productService.updateById()` are the system-under-test entry points. |
| `src/modules/products/repository.ts` | `productRepository` is spied on in the failure tests; `createProduct` / `readProduct` from the module's test factories. |
| `src/modules/inventory/repository.ts` | `stockLevelRepository.findByProductId` is queried to confirm the level row's presence or absence. |
| `src/modules/cart/services/checkout.ts` | `orderConfirm` performs the real checkout that creates the pending order. |
| `src/modules/cart/services/items.ts` | `cartItemSetById` adds the product to the cart before checkout. |
| `src/modules/cart/repository.ts` | `cartRepository.setShippingMethod` (setup) and `cartRepository.findByUserId` (failure-test assertion). |
| `src/modules/orders/tests/factories.ts` | `readOrder` fetches the order to check its `status`. |
| `src/modules/payments/module.ts` | `paymentsModule` is registered via `registerCheckoutModules` so checkout includes payment logic. |
| `src/modules/payments/services/intent.ts` | `createIntent` simulates a card-payment start; tests assert it still succeeds after removal. |
| `src/modules/payments/services/offline.ts` | `recordOfflinePayment` simulates an admin recording an offline payment; tests assert it still succeeds. |
| `src/modules/addresses/tests/factories.ts` | `giveAddress` supplies the shipping/billing address required by checkout. |

## Notes

- **`flush()` before every mock clear.** `sendOrderPlacedEmail` is fire-and-forget; without the `setImmediate` tick, `mockClear()` could race ahead of the email dispatch, making "no email" assertions vacuously true or falsely failing.
- **Soft-delete is idempotent/restore.** Calling `productService.remove(product, false)` on an already soft-deleted product acts as a restore (sets `deletedAt = null`). The "soft delete or a restore" block relies on this.
- **Event emission is post-write.** The failure tests encode the invariant that `PRODUCT_DELETED` is emitted only *after* the repository write succeeds. If the implementation ever reorders this, the cart-listener test will catch it.
- **Business rule provenance.** The file-header comment references "Q14 of the merge-alert plan" as the originating requirement; the test is the executable specification for that rule.
