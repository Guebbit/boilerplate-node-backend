---
source: src/modules/payments/tests/integration/refund-email.test.ts
source_sha256: b7e029d3aecfe9a6ef9e8dc82f20516567edf171f29b94ea6395bb472649b290
context_sha256: 2b8805a0f843e1554724b9b360bc6a6eeb58af8a1721210a95781f4942ac3dfb
generated_at: 2026-11-22T06:59:30.743563+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/integration/refund-email.test.ts

## Purpose
Integration test verifying that money going back is never silent. A refund that settles outside a return mails the buyer the `payments.refund-issued` template. Refunds made for a return are announced by `returns`' own closing notice. Refunds the provider refused moved no money. Neither of those two cases mails from here. The mail send is fire-and-forget and starts with a real Mongo read, so the tests poll for presence and wait out a straggler to show absence. It follows the same shape as `settlement-email.test.ts`.

## Key elements
- `jest.mock('@infrastructure/adapters/mailer')`: replaces `enqueueEmail` with a mock, aliased as `mockEnqueueEmail`. Tests assert on what was queued.
- `waitForMails(done)`: wraps `eventually` and calls `settleOutboxNudges()` on each poll, because the mail rides the outbox.
- `mailsOf(template)` / `dataOf(template)`: filter the mock's calls by template name, and return the template data of the first matching mail.
- `paidOrder()`: creates a user, a product (50.00, 10 on hand), and an order of 2 units. It reserves inventory, pays by card (100.00), then settles the outbox. It returns `{ user, order, orderId }`.
- `refundedOf(orderId)`: reads `amountRefunded` from `paymentRepository.findByOrderId`, defaulting to 0.
- `describe('a refund outside a return mails the buyer')`: covers these cases:
  - A partial refund (30.00) mails the order's email with "part of what you paid".
  - A full 100.00 refund says "everything".
  - Two sequential refunds (30.00 then 70.00) are judged on the refunds settled so far: the first says "part", the last says "everything".
  - A paid cancel via `orderService.cancelOnRequestById` sends `orders.order-canceled` and then one `payments.refund-issued`.
- `describe('who may return money for a return')`: tests `refundForReturn` authorization with these cases:
  - Anonymous callers and non-staff customers are refused ("may not return money"), and no money moves.
  - A buyer is refused for a goods return.
  - The order's own buyer may cancel the remainder (`reason: 'cancellation'`).
  - Another customer is refused that same cancellation.
  - A manager may do it.
- `describe('a refund that must not mail')`: no `payments.refund-issued` is sent for a return's refund, or when the payment provider's `refund` is mocked to reject once. In the rejection case the call still resolves `{ success: true, status: 201 }`.

## Relationships
- `@modules/payments/tests/factories`: provides `refundOrderPayment`, `payByCard` and `refundForReturn`.
- `@modules/payments/module` and `@tests/checkout-modules`: `registerCheckoutModules([paymentsModule])` runs before each test.
- `scenarios/support/doubles/payments/fake.ts`: `fakePaymentProvider` is spied on to simulate a provider failure.
- `src/infrastructure/adapters/mailer.ts`: mocked, with `enqueueEmail` as the observation point.
- `src/kernel/outbox.ts`: `settleOutboxNudges` flushes pending delivery.
- `src/kernel/events.ts`: `resetDomainEvents` runs after each test.
- `src/modules/orders` (`orderService`): used to cancel a paid order.
- `src/modules/inventory` (`inventoryService`): `reserveForOrder` is called in `paidOrder`.
- The users, products and orders test factories build the fixtures. `tests/support/callers.ts` supplies `asAdmin`, `asCustomer`, `callerContextAs` and `testCallerContext`.
- `src/modules/payments/repository.ts` (`paymentRepository`): reads the refunded amount.
- `@tests/setup-test-db` and `@tests/eventually` provide DB setup and the polling helper.

## Notes
- `paidOrder` reserves inventory first because every `payment.succeeded` listener runs, so the order needs the hold a real checkout made. It also settles the outbox before the test continues.
- A test that expects no mail waits only on `settleOutboxNudges()`, not on a poll, since absence can't be polled for.
- The cancel test calls `mockEnqueueEmail.mockClear()` after `paidOrder()` so earlier mails don't count.
- `afterEach` calls `resetDomainEvents()` and `jest.restoreAllMocks()`.
