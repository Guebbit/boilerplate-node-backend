---
source: tests/integration/product-removal-protects-orders.test.ts
sha256: abad59445ff592692930727aa5cb192f681007cdeac2cb8f4319e32221020877
generated_at: 2026-09-23T20:05:53.570253+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/product-removal-protects-orders.test.ts

## Purpose

Integration test for the cross-module cascade triggered when a product is hard-deleted, deactivated, or soft-deleted: the product module announces the event, inventory drops (or keeps) the stock-level row, orders cancels pending orders and emails the buyer, and a racing payment intent is refused. It also verifies that an admin offline-payment recording still succeeds when the product is gone. Because the scenario wires four modules' real `subscribe()` hooks together, it lives in `tests/integration/` rather than inside any single module's test directory.

## Key elements

- **`placePendingOrder(product)`** – Helper that creates a user, adds one unit to the cart, runs the real `orderConfirm` checkout, then `flush()`es and clears the email mock so subsequent assertions only see post-removal mail.
- **`flush()`** – Returns a `setImmediate`-based promise to let the fire-and-forget `sendOrderPlacedEmail` → `enqueueEmail` microtask chain land before assertions run.
- **`renderInvoicePdfMock`** – Mocks `renderInvoicePdf` to resolve `undefined`, avoiding a real Chromium/PDF render while keeping the rest of the invoice module's exports intact via `jest.requireActual`.
- **`mockEnqueueEmail`** – Jest mock on `enqueueEmail`; assertions check call count, recipient, and template name (e.g. `'orders.order-product-unavailable'`).
- **`describe('hard-deleting …')`** – Asserts product is gone, order is `cancelled`, exactly one cancellation email fires, and the stock-level row is deleted.
- **`describe('deactivating …')`** – Asserts order is `cancelled`, email fires, but the stock-level row is *preserved* (reversible).
- **`describe('a soft delete or a restore')`** – Asserts `productService.remove(…, false)` (soft delete) and the subsequent restore both leave the level row untouched.
- **`describe('a payment attempt racing the removal event')`** – Bypasses the event listener by directly deleting the stock row and stamping `deletedAt`, then calls `createIntent`; expects a 409 `ORDER_PRODUCT_UNAVAILABLE` response naming the product.
- **`describe('admin offline recording …')`** – Same "product gone" setup, but calls `recordOfflinePayment`; expects success and order status `paid`.

## Relationships

- **`src/kernel/registry.ts`** – `registerModules([...])` in `beforeEach` wires all eight modules into the event bus so their real `subscribe()` hooks fire.
- **`src/kernel/events.ts`** – `resetDomainEvents()` in `afterEach` clears queued domain events between tests.
- **`src/infrastructure/adapters/mailer.ts`** – `enqueueEmail` is fully mocked; the test asserts call count, arguments, and template.
- **`src/infrastructure/http/response.ts`** – `ResponseReject` type used to type-cast the failed `createIntent` result and inspect `status`/`errors`.
- **`src/modules/inventory/repository.ts`** – `stockLevelRepository.findByProductId` and `deleteByProductId` used to assert (or simulate) level-row state.
- **`src/modules/cart/services/checkout.ts` / `items.ts`** – `orderConfirm` and `cartItemSetById` drive the real checkout flow in setup.
- **`src/modules/payments/module.ts`** (via `services/intent`, `services/offline`) – `createIntent` and `recordOfflinePayment` are the payment-side actors under test.
- **`src/modules/orders/tests/factories.ts`** – `readOrder` to inspect post-cascade order state.
- **`src/modules/products/module.ts`** (and its factories) – `productService.remove` / `updateById` are the actions being tested; `createProduct` / `readProduct` set up and inspect the product.
- **`src/modules/account/module.ts`**, **`delivery/module.ts`**, **`src/modules/users/…`** – Registered so the full module graph resolves; not directly exercised beyond setup.

## Notes

- The "racing" and "offline" tests deliberately **bypass the domain-event listener** by mutating DB rows directly (`stockLevelRepository.deleteByProductId`, setting `deletedAt`). This simulates the exact window where the listener hasn't yet run, so the payment module's own guard is the only protection.
- `renderInvoicePdf` is mocked but the invoice module file itself is loaded via `jest.requireActual` spread, so every other export (helpers, types) remains real. Without this, the fire-and-forget chain would attempt a real PDF render.
- `flush()` is necessary because `sendOrderPlacedEmail` dispatches its `enqueueEmail` call in a `setImmediate`-like microtask chain *after* `orderConfirm` has already returned; asserting on the mock without flushing would be a race.
- The file uses `void toDeactivate` as a no-op to satisfy lint (the variable is read for existence confirmation but not otherwise used).
