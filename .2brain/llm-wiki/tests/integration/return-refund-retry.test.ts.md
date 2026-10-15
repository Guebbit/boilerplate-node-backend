---
source: tests/integration/return-refund-retry.test.ts
sha256: de78cd8c354d5f5843ddbe1b98f1da46afd0f4a1a1dfbf62e567ba82f59d7963
generated_at: 2026-10-15T12:52:21.928296+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/return-refund-retry.test.ts

## Purpose

Integration test for the cross-module scenario where a payment provider refuses a refund on a return. It verifies that a failed refund does **not** undo the receipt of goods, that the refund is recorded as `failed` on the payment, and that a subsequent `retryOpenRefunds` sweep completes the refund and transitions the return to `closed`. It lives here (rather than inside `returns` or `payments`) because the behavior is emergent across both modules.

## Key elements

- **`withdrawnOrder()`** — helper that builds the full pre-condition: user, product, reserved inventory, paid order, delivered shipment, and a created return (reason `withdrawal`). Returns `{ shirt, orderId, returnId }`.
- **`waitFor(check)`** — small polling utility (10 ms interval, 3 s timeout) that waits for a fire-and-forget domain-event listener to persist its write.
- **`describe('a return whose refund the provider refuses')`** — single test case that:
  - Sets `NODE_PAYMENT_EFFECT_RETRY_MINUTES=0` via `withEnvironment`.
  - Mocks `fakePaymentProvider.refund` to reject once.
  - Calls `receiveReturn` and asserts the return is `received`, stock is restored, and the refund is `failed`.
  - Calls `paymentService.retryOpenRefunds()`, then polls until the return is `closed` with a `closedAt` timestamp, and confirms the payment is `succeeded`.

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** — `fakePaymentProvider.refund` is spied on and forced to reject, simulating a provider outage.
- **`src/kernel/events.ts`** — `resetDomainEvents()` in `afterEach` clears the event bus between tests.
- **`src/modules/payments/module.ts`** / **`src/modules/payments/index.ts`** / **`src/modules/payments/services/index.ts`** — registers the payments module and imports `createIntent`, `confirmPayment`, `paymentService`.
- **`src/modules/payments/services/intent.ts`** — used to create the payment intent in the setup.
- **`src/modules/payments/services/settlement.ts`** — underlying service that `retryOpenRefunds` ultimately calls to re-attempt the failed refund.
- **`src/modules/returns/module.ts`** / **`src/modules/returns/index.ts`** — registers the returns module; imports `createReturn` and `receiveReturn`.
- **`src/modules/returns/repository.ts`** — `returnRepository.findById` is used to assert the final `closed` status and `closedAt` field.
- **`src/modules/inventory/services/index.ts`** — `inventoryService.reserveForOrder` allocates stock before the order is paid.
- **`src/modules/delivery/tests/factories.ts`** — `carryOrderTo` advances the order through shipment stages to `delivered`.
- **`src/modules/orders/tests/factories.ts`**, **`src/modules/products/tests/factories.ts`** — `createOrder`, `createProduct`, `countersOf` for test fixtures and stock assertions.

## Notes

- The test relies on `jest.restoreAllMocks()` in `afterEach`; the single `mockRejectedValueOnce` is auto-restored, but omitting the restore would leak the failure into other tests.
- `waitFor` exists because the return-closing write happens inside a domain-event listener (fire-and-forget), not synchronously after `retryOpenRefunds` resolves. Polling the repository directly avoids coupling to the listener's internal timing.
- The environment variable `NODE_PAYMENT_EFFECT_RETRY_MINUTES=0` is set so that the sweep does not defer to a real-world backoff window.
