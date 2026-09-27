---
source: tests/integration/product-removal-protects-orders.test.ts
sha256: b543535b03e7fc54b1b7ba3f8cd50665ce9b8f3d07873598b5dfce350f025ef9
generated_at: 2026-09-27T15:57:24.232197+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/product-removal-protects-orders.test.ts

## Purpose

Integration test that verifies the cross-module cascade triggered when a product is hard-deleted, deactivated, soft-deleted/restored, or disappears mid-transaction. It asserts that `products` announces the event, `inventory` drops (or keeps) the stock-level row, `orders` cancels pending orders and emails the buyer, and `payments` refuses a racing intent while still allowing an admin offline record. It lives in `tests/integration/` rather than any single module's `tests/` because it exercises four modules' real `subscribe()` hooks together.

## Key elements

- **`placePendingOrder(product)`** — helper that creates a user, adds the product to the cart, sets pickup shipping, confirms the order via `orderConfirm`, flushes the fire-and-forget confirmation email, then clears the mailer mock so subsequent assertions only see cancellation emails.
- **`flush()`** — `setImmediate`-based promise that waits for the `sendOrderPlacedEmail` → `renderInvoicePdf` → `enqueueEmail` microtask chain to complete before assertions run.
- **`renderInvoicePdfMock`** — mocks `renderInvoicePdf` to resolve `undefined`, preventing a real Chromium launch from stretching test time while keeping the rest of the invoice module real.
- **`describe('hard-deleting…')`** — calls `productService.remove(product, true)`; asserts product is gone, order is `cancelled`, exactly one email with template `orders.order-product-unavailable` was sent, and `stockLevelRepository.findByProductId` resolves to `null`.
- **`describe('deactivating…')`** — calls `productService.updateById(…, { active: false })`; asserts order cancelled + email sent, but the stock-level row is **retained** (deactivation is reversible).
- **`describe('a soft delete or a restore')`** — calls `productService.remove(product, false)` (soft delete) then again (restore); asserts the stock-level row survives both operations.
- **`describe('a payment attempt racing the removal event')`** — bypasses the domain-event listener by directly deleting the stock row and setting `deletedAt` on the product document; calls `createIntent` and asserts a `409` with error code `ORDER_PRODUCT_UNAVAILABLE` and product name in `details.lines`.
- **`describe('admin offline recording…')`** — same race setup, then calls `recordOfflinePayment`; asserts it still succeeds and the order reaches `paid` status (money already moved).

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/products/service.ts` | System under test: `productService.remove` and `productService.updateById` trigger the cascade. |
| `src/modules/products/index.ts` | Re-exports `productService` (imported from here). |
| `src/modules/products/tests/factories.ts` | `createProduct` / `readProduct` for setup and post-state assertions. |
| `src/modules/cart/services/index.ts` | `cartItemSetById` and `orderConfirm` drive the real checkout flow. |
| `src/modules/cart/services/checkout.ts` | Implements `orderConfirm`, which publishes the `orderConfirm` domain event. |
| `src/modules/cart/services/items.ts` | Source of `cartItemSetById`. |
| `src/modules/cart/repository.ts` | `cartRepository.setShippingMethod` sets pickup before checkout. |
| `src/modules/inventory/repository.ts` | `stockLevelRepository` — asserted on for row existence; also mutated directly to simulate the race gap. |
| `src/modules/orders/tests/factories.ts` | `readOrder` reads order status after the cascade. |
| `src/modules/payments/module.ts` | `paymentsModule` registered via `registerCheckoutModules` so its `subscribe()` hooks are live. |
| `src/modules/payments/services/intent.ts` | `createIntent` is the backstop checked in the race-condition test. |
| `src/modules/payments/services/offline.ts` | `recordOfflinePayment` tested for the "money already moved" case. |
| `src/kernel/events.ts` | `resetDomainEvents()` in `afterEach` prevents cross-test event leakage. |
| `src/infrastructure/adapters/mailer.ts` | `enqueueEmail` is fully mocked; call count and template are asserted. |
| `src/infrastructure/http/response.ts` | `ResponseReject` type used to safely access `status`/`errors` on the failed intent result. |

## Notes

- **Fire-and-forget email:** `sendOrderPlacedEmail` dispatches without awaiting `enqueueEmail`. Tests must call `flush()` (a `setImmediate` tick) before asserting on the mailer mock, or the call may not have landed yet.
- **Race-condition simulation:** The two "race" tests deliberately bypass the domain-event listener (which would cancel the order) by mutating the DB directly (`stockLevelRepository.deleteByProductId` + setting `deletedAt`). This isolates `createIntent`'s own in-flight check as the sole guard.
- **Hard vs. soft vs. deactivate:** The stock-level row is deleted **only** on hard delete. Soft delete, restore, and deactivation all leave it intact — an invariant the tests pin down.
- **Mailer mock is global per file:** `jest.mock` at the top replaces the module for the entire test file; the mock is cleared in `beforeEach` and after `placePendingOrder` so each assertion sees only the email it expects.
