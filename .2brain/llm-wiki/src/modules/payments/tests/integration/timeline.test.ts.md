---
source: src/modules/payments/tests/integration/timeline.test.ts
source_sha256: 960c72426d9be04c1370eb978308b52fc52fd9ca1da4407d74c88fce2e11d1e7
context_sha256: a0db9aea53a86ead3e9dbd5f6b2647b8a9034f165ce4e22dc0ba955533121729
generated_at: 2026-11-22T07:03:18.987844+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/integration/timeline.test.ts

## Purpose
Integration test suite (real Mongo, via the services' public API) for what the payments module writes onto an order's timeline: the `paid` row and its actor, declines, and a refund's three moments (`refund_issued`, `refund_settled`, `refund_failed`). It verifies that rows carry only ids, money and closed codes, never the provider's raw wording, and that they are written in the same transaction as the fact they record.

## Key elements
- `setupTestDb()`: sets up the test database.
- `beforeEach` registers the checkout modules together with `paymentsModule`. `afterEach` calls `resetDomainEvents()` and `jest.restoreAllMocks()`.
- `paidOrder()`: helper that creates a user, a 50.00 product and an order with 2 units. It creates a payment intent and confirms it with `pm_card_visa`, then returns `{ user, orderId }`.
- `refund(orderId, amount)`: helper that calls `refundOrderPayment` as the operator `admin-1` (admin role).
- `describe('the payment')` covers:
  - `paid` carries `method: 'card'` and no `actor` for a card payment.
  - Offline cash payments name the operator (`cashier-1`) and the method `cash`.
  - `recordDecline` writes a `payment_declined` row once (with `paymentId`) and does not write a second row when called again (the second call returns a falsy result).
- `describe('a refund')` covers:
  - A successful refund writes `refund_issued` and then `refund_settled`, with actor, amount, currency `EUR`, reason `goodwill` and a matching `refundId`.
  - A failed refund writes `refund_failed` with a closed `failureReason` code (`insufficient_funds`). The raw provider text never appears in the rows.
  - `retryOpenRefunds` retries with `NODE_PAYMENT_REFUND_RETRY_MINUTES=0`. A repeated identical failure reason does not add a row. A new reason (`declined`) does, and the stored refund's `attempts` ends at 4.
  - The buyer's timeline hides `refund_failed`, while staff see it.

## Relationships
- **Services under test:** `paymentService` (`createIntent`, `confirmPayment`, `recordOfflinePayment`, `retryOpenRefunds`) from `payments/services`, and `recordDecline` from `payments/services/announce`.
- **Orders module:** `orderService` from `@modules/orders` is used to place the orders for the offline-payment and decline tests.
- **Repository:** `paymentRepository` from `payments/repository` is used to read the stored payment and check the refund's `attempts`.
- **Provider double and errors:** `fakePaymentProvider` from `scenarios/support/doubles/payments/fake` is spied on to inject refund failures. `PaymentProviderError` from `payments/providers` supplies the closed error codes.
- **Factories and helpers:**
  - `refundOrderPayment` comes from `../factories` (payments tests factories).
  - `createUser`, `createProduct`, `createOrder`, `toOrderItem`, `timelineOf` and `timelineAs` come from the users, products and orders test factories.
  - `tests/support/callers` provides `asCustomer`, `asAdmin`, `testCallerContext` and `callerContextAs`.
- **Kernel and wiring:** `resetDomainEvents` comes from `@kernel/events`. `registerCheckoutModules` comes from `@tests/checkout-modules`, and `withEnvironmentOverrides` comes from `@tests/environment`.

## Notes
- The refund-failure test where `refund` resolves with `{ success: true, status: 201 }` shows that a provider failure does not fail the refund request. The failure is recorded on the timeline instead.
- The retry test uses four mocked rejections, so one `refund()` call plus three `retryOpenRefunds()` calls makes 4 attempts. The first three rejections share a reason, so they produce only one `refund_failed` row.
- A non-provider error (`new Error('down')`) is used in the visibility test, and the `refund_failed` row is still shown to staff.
