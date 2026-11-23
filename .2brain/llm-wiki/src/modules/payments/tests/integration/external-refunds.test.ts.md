---
source: src/modules/payments/tests/integration/external-refunds.test.ts
source_sha256: ebbbd1a03da18c6e483c12ff93bb685e0f17a34632e37389419c2319ce3b3e44
context_sha256: 808c77a82272b1ee7aeacaec7ba0bfd01e2ccfb34367665cf5c8d3c8e97e773b
generated_at: 2026-11-22T06:56:56.588668+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/integration/external-refunds.test.ts

## Purpose
Integration test suite (real Mongo, fake payment provider) for refunds made directly in the provider's own dashboard. It verifies that such refunds are discovered via a refund event, recorded once as settled `external` refunds with the usual follow-ups (order stamp, `payment.refunded` event, buyer mail), matched rather than imported when they are our own, and still recorded when they leave an open refund of ours with no room (that one is held unsent).

## Key elements
- **Mocked mailer**: `@infrastructure/adapters/mailer` is replaced with a `jest.fn()` `enqueueEmail`; cases assert which mail (e.g. `payments.refund-issued`) was enqueued.
- **Setup hooks**: `setupTestDb()`; `beforeEach` clears the mail mock and calls `registerCheckoutModules([paymentsModule])`; `afterEach` calls `resetDomainEvents()` and `jest.restoreAllMocks()`.
- **`paidOrder()`**: creates a user, a product (50.00 × 2), an order, reserves inventory, pays by card, settles outbox nudges. Returns `{ orderId, providerRef }` for a 100.00 payment.
- **Lookup helpers**: `paymentOf`, `refundsOf`, `refundedOf` (decimal `amountRefunded`), `stampOf` (order's `paymentStatus`).
- **`deliverRefund(providerRef, refundRef)`**: delivers a provider refund event via `deliver`.
- **Outbox helpers**: `refundedEvents()` counts `payment.refunded` rows; `unrecordedEvents()` returns payloads of `payment.refund_unrecorded` rows.
- **`overtaken()`**: scenario where our 50.00 refund fails transiently (`provider_unavailable`), then an 80.00 dashboard refund is added and delivered.
- **Test cases** (in the `a refund made in the dashboard` describe, visible portion):
  - Imported once (idempotent on redelivery) as a succeeded `external` record with `idempotencyKey` `import:<refundRef>`, `settledAt` from provider `createdAt`, stamp `partially_refunded`, one event, one buyer mail.
  - Two partial refunds are both imported from one delivery; the payment view shows `partially_refunded`.
  - Pending refunds are skipped until they succeed; failed ones are skipped silently.
  - Non-EUR refunds are not converted: nothing recorded, `payment.refund_unrecorded` emitted with reason `other_currency`.
  - If `paymentRepository.importRefund` keeps returning `null`, it is attempted 4 times (first plus three re-reads), nothing is recorded, and staff are told once with reason `lost_race`; no staff notice if a later attempt wins.
  - `syncRefunds` imports a recordable refund once but re-announces an unrecordable (USD) one on each run.
  - A refund larger than the amount paid (130.00) is still recorded and the stamp becomes `refunded`.

## Relationships
- `scenarios/support/doubles/payments/fake.ts`: the fake provider and its dashboard levers (`addFakeExternalRefund`, `setFakeRefundFailure`, `setFakeRefundOutcome`, `fakePaymentProvider`, `refundRefOfRecord`, `setFakeRefundTimeout`).
- `src/infrastructure/adapters/mailer.ts`: mocked to capture enqueued mail.
- `src/kernel/events.ts`: `resetDomainEvents` between tests.
- `src/kernel/outbox.ts`: `outboxEventModel` and `settleOutboxNudges` for asserting and flushing events.
- `src/modules/payments/events.ts`: `PAYMENT_REFUNDED` and `PAYMENT_REFUND_UNRECORDED` names.
- `src/modules/payments/repository.ts`: `paymentRepository` for reading payments and spying on `importRefund`.
- `src/modules/payments/services/index.ts`: `paymentService`, used for `getForOrder` and `syncRefunds`.
- `src/modules/payments/module.ts`: registered via `registerCheckoutModules`.
- `src/modules/payments/tests/deliver.ts`: delivers the provider event.
- `src/modules/payments/tests/factories.ts`: `payByCard`, `refundOrderPayment`.
- `src/modules/orders/index.ts`, `src/modules/orders/services/index.ts`: the `orderService` import, used to read the order's payment status stamp.
- `src/modules/orders/tests/factories.ts`: `createOrder`/`toOrderItem` for setup.
- `src/modules/inventory/index.ts`, `src/modules/inventory/services/index.ts`: the `inventoryService` import, used to reserve stock before paying.

## Notes
- Some imports (`fakePaymentProvider`, `refundRefOfRecord`, `setFakeRefundTimeout`, `refundedOf`) are not used in the visible portion; they presumably serve later cases.
- `setFakeRefundOutcome` is loaded with a dynamic `import()` inside one test rather than a top-level import.
- Eventual-consistency assertions use `eventually` together with `settleOutboxNudges`.
- `jest.restoreAllMocks()` in `afterEach` undoes the `importRefund` spies.
