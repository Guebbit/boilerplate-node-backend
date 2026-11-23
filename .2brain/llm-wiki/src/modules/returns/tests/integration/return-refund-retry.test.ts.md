---
source: src/modules/returns/tests/integration/return-refund-retry.test.ts
generated_at: 2026-11-22T07:37:21.810192+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/tests/integration/return-refund-retry.test.ts

## Purpose
Integration test for the case where a return's refund is refused by the payment provider (or can't be recorded). It checks that the goods are still counted as received, the refund stays open on the payment tagged with the return's id, and the payment sweep completing that refund is what closes the return. Because `returns` depends on `payments`, the real payment sweep runs rather than a stub.

## Key elements
- `withdrawnOrder()` — helper that builds a user, a product (price 30.00, `onHand: 10`), and an order of 2 units. It reserves inventory, creates and confirms a payment intent, carries the order to `delivered` through the real delivery flow, then creates a `withdrawal` return. It returns `{ shirt, orderId, returnId }`.
- `beforeEach` / `afterEach` — register `paymentsModule` and `returnsModule` via `registerCheckoutModules`; reset domain events and restore mocks after each test. `setupTestDb()` provides the database.
- Test 1: provider `refund` rejects once. `receiveReturn` still reports `received`, stock is back to `onHand: 10`, and the payment holds a `failed` refund carrying `returnId`. `paymentService.retryOpenRefunds()` then lets the return reach `closed` with a `closedAt` date, and the payment becomes `succeeded`.
- Test 2: `paymentService.openReturnRefund` rejects once. `receiveReturn` throws, nothing is committed (return stays `approved`, `onHand` stays 8, no refunds on the payment), and a second `receiveReturn` succeeds with status `closed`.
- Test 3: `inventoryService.forgetAvailability` rejects once, after the commit. `receiveReturn` throws, but the payment already has a `pending` refund with `returnId`. The sweep then closes the return.

## Relationships
- `scenarios/support/doubles/payments/fake.ts` — exports the fake payment provider that the test spies on to inject the refund failure.
- `src/modules/payments` (`index.ts`, `module.ts`, `services/index.ts`) — `paymentService` (`createIntent`, `confirmPayment`, `getForOrder`, `retryOpenRefunds`, `openReturnRefund`) and `paymentsModule` are registered for the test.
- `src/modules/returns` (`module.ts`, `services/index.ts`, `repository.ts`) — `returnsModule` is registered; the returns service (`createReturn`, `receiveReturn`) is under test, and the returns repository is used to verify stored state.
- `src/modules/inventory` (`index.ts`, `services/index.ts`) — `inventoryService` is used in setup to reserve stock, and its `forgetAvailability` is mocked to fail.
- `src/kernel/events.ts` — `resetDomainEvents` clears event state between tests.
- Factories in `users`, `products` (`createProduct`, `countersOf`), `orders` (`createOrder`, `toOrderItem`) and `delivery` (`carryOrderTo`) build the fixtures.
- `tests/support/callers.ts` — provides `asAdmin`, `asCustomer`, `testCallerContext` and `callerContextAs`.

## Notes
- Tests 1 and 3 wrap their bodies in `withEnvironmentOverrides({ NODE_PAYMENT_REFUND_RETRY_MINUTES: '0' })` so the sweep treats the refund as immediately due.
- Closing the return is asynchronous, so the tests poll with `eventually` after `retryOpenRefunds()`.
- The test 2 and 3 assertions (`onHand: 8`, a `pending` refund) show where the transaction boundary lies: a failure while recording the refund rolls everything back, while a failure after the commit leaves a durable refund record for the sweep.
- `jest.spyOn(...).mockRejectedValueOnce` is used throughout, so only the first call fails and later calls behave normally.
