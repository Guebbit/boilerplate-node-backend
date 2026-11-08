---
source: src/modules/payments/tests/integration/late-payment.test.ts
sha256: 295df845a0e069db9366af2fd4a3bcb582fd869498b4aaf1271797420ce29f09
generated_at: 2026-11-08T07:33:11.354312+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/late-payment.test.ts

## Purpose

Integration tests for the race where a payment (card or offline) arrives after the order's inventory hold has expired but before the order is formally canceled. Verifies that the system either re-takes stock and pays the order, or keeps the order pending, issues a refund, and lets the late cancellation proceed — without overselling.

## Key elements

- **`levelOf(productId)`** — settles outbox nudges then reads `{ onHand, reserved }` counters; always called before asserting stock state because counters update via outbox-driven cache refresh, not synchronously.
- **`refundsOf(orderId)`** — returns the payment's `refunds` array for an order.
- **`orderStatusOf(orderId)`** — returns the order's current status string.
- **`heldOrderFor(user, product, extras?)`** — creates an order for one unit and reserves stock via `inventoryService.reserveForOrder`; throws if the hold is refused.
- **`expiredCardOrder(onHand)`** — full setup: card intent created, hold released via `inventoryService.releaseForOrder(orderId, 'expire')`; returns `orderId`, `product`, `productId`, `providerRef`.
- **`describe('a card payment that lands on a released hold')`** — four cases: stock available → re-reserve + pay; stock sold → refund + pending + late cancel; refund email sent; canceled-before-landing → no retake, ledger shows only `reserve` + `expire`.
- **`describe('a hand-recorded payment that lands on a released hold')`** — two cases for `bank_transfer`: stock sold → 409 + refund recorded as *not* succeeded (owed by hand); stock available → paid normally.
- **`describe('an order handed money it could not take')`** — verifies hard-delete is refused (`hardDelete: false`) when a succeeded payment with a refund points at the order.

## Relationships

| Neighbor | Interaction |
|---|---|
| `scenarios/support/doubles/payments/fake.ts` | `fakePaymentProvider.confirm(providerRef, …)` simulates the PSP webhook that triggers settlement. |
| `src/infrastructure/adapters/mailer.ts` | Mocked (`enqueueEmail`); asserted in the refund-email test to confirm `payments.refund-issued` template is enqueued. |
| `src/infrastructure/observability/audit.ts` | `registerAuditSink` captures entries; one test asserts **no** `payment.refund_owed_by_hand` entry for card refunds. |
| `src/kernel/events.ts` | `resetDomainEvents()` in `afterEach` clears the in-memory event bus between tests. |
| `src/kernel/outbox.ts` | `settleOutboxNudges()` flushes pending outbox entries (cache refresh, email enqueue) before assertions. |
| `src/modules/inventory/services/index.ts` | `inventoryService` — `reserveForOrder`, `releaseForOrder`, `isStockBoundToOrder`, `isHoldReleased`, `listMovements`. |
| `src/modules/orders/services/index.ts` | `orderService` — `getById`, `expireReservationById`, `withActions`, `removeById`. |
| `src/modules/orders/tests/factories.ts` | `createOrder`, `toOrderItem` build the order fixture. |
| `src/modules/payments/services/index.ts` | `paymentService` — `createIntent`, `applyWebhookSettlement`, `openTransferPayment`, `recordOfflinePayment`. |
| `src/modules/payments/repository.ts` | `paymentRepository.findByOrderId` to inspect payment status and refunds. |
| `src/modules/payments/module.ts` | Registered via `registerCheckoutModules([paymentsModule])` in `beforeEach`. |
| `src/modules/products/tests/factories.ts` | `createProduct`, `countersOf`. |
| `src/modules/users/tests/factories.ts` | `createUser`. |

## Notes

- **Outbox is the source of truth for stock counters.** `levelOf` always calls `settleOutboxNudges()` first; reading counters without settling will give stale values.
- **The "stranger" pattern.** A second user reserves the same single unit to simulate the stock being sold between hold-expiry and payment arrival. This is the mechanism that forces the "short" path.
- **`eventually` helper** is used for the email assertion because the email is enqueued by an outbox nudge, making it asynchronous relative to `applyWebhookSettlement`.
- **Offline (hand) refunds differ from card refunds.** A card refund is marked `succeeded` immediately (provider handles it); a hand refund is left in a non-succeeded state because an operator must issue it off-system. The audit sink distinguishes the two.
- **Hard-delete guard.** An order that has a succeeded payment + refund (the "handed money it could not take" case) exposes `hardDelete: false` in its action flags and `removeById(orderId, true)` is refused.
- **File is truncated** in the source provided; the final assertion in the hard-delete test is cut off.
