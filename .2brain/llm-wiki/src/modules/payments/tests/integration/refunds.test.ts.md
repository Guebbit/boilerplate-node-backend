---
source: src/modules/payments/tests/integration/refunds.test.ts
source_sha256: b68b792a6b07f697c9077ffd9c2fd5267372ec9f8db3e213b150951bdd9e6d0d
context_sha256: 7d4ecc93aa4777d8f557bce2189b3972e2de111f93082d9d91efc1cdd570f429
generated_at: 2026-11-22T07:01:41.163813+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/integration/refunds.test.ts

## Purpose
Integration tests (real Mongo) for payment refunds. A refund is a row on the payment, opened before the provider is called. The tests check that partial refunds leave the remainder refundable, that racing refunds cannot return more than was paid, and that a provider refusal leaves the refund open so the sweep can finish it with the same idempotency key.

## Key elements
- `paidOrder()`: creates a user, a 50.00 product, and an order of 2 units, pays it by card (100.00 EUR), then calls `settleOutboxNudges()` so the settlement's outbox rows are published before a test cancels or refunds.
- `paymentOf(orderId)`: loads the payment through `paymentRepository.findByOrderId`, and throws if none exists.
- `refund(orderId, body)`: calls `refundOrderPayment` (from `../factories`) as an admin caller.
- `describe('a partial refund')`:
  - Records the refund (`reason: 'goodwill'`, provider ref matching `re_fake_refund:`), and the payment stays `succeeded` with `amountRefunded` tracked.
  - Refunds the whole remainder when no amount is given.
  - Sums in minor units, so 0.10 + 0.20 gives 0.30.
  - Sends the provider only the part being refunded, under a distinct idempotency key per refund.
  - Emits `PAYMENT_REFUNDED` once per refund, with a `full` flag and a unique `refundId`.
- `describe('a refund that asks for too much')`:
  - 422 `PAYMENT_REFUND_EXCEEDS_REMAINING` (`details.field: 'amount'`) when the amount is more than what is left.
  - 422 `VALIDATION_ERROR` naming `currency` for a currency other than the payment's, and naming `amount` for sub-minor-unit precision.
  - 409 when no amount is given and nothing is left.
  - Two concurrent 60.00 refunds: only one succeeds.
  - The opener of a refund that the sweep settled first (`paymentService.retryOpenRefunds()` called from inside a mocked provider `refund`, with `NODE_PAYMENT_REFUND_RETRY_MINUTES=0`) still gets success.
- `describe('a refund the provider refuses')`: begins with a case where the provider rejects with `Error('provider secret detail')`. The refund stays on the record as failed with a closed reason, and the provider wording never reaches the wire. The rest of the file is not shown here.

## Relationships
- `scenarios/support/doubles/payments/fake.ts`: `fakePaymentProvider` is the provider double. Tests spy on its `refund` to inspect the amounts and idempotency keys it receives, or to force failures.
- `src/modules/payments/module.ts`: `paymentsModule` is registered through `registerCheckoutModules([paymentsModule])` in `beforeEach`.
- `src/modules/payments/model.ts`: `paymentModel` gives direct access to the stored payment and its `refunds`. `paymentRepository` is imported from `@modules/payments/repository`.
- `src/modules/payments/events.ts` and `src/kernel/events.ts`: `PAYMENT_REFUNDED` is observed with `onDomainEvent`, and `resetDomainEvents` runs in `afterEach`.
- `src/kernel/outbox.ts`: `outboxEventModel` and `settleOutboxNudges` let the outbox relay deliver events before assertions.
- `src/infrastructure/observability/audit.ts`: mocked with `auditPortMock()` from `@tests/ports`. Used together with `paymentsAuditActions` from `src/modules/payments/audit.ts` and `observePort`.
- `src/modules/payments/presenter.ts`: `presentPayment` is imported for the provider-failure tests.
- `src/modules/payments/providers/errors.ts`: `PaymentProviderError` is imported for the provider-failure tests (imported via `@modules/payments/providers`).
- `src/modules/orders/index.ts`: `orderService` and `withdrawalRefundDueBy` are imported from the orders module.
- `src/modules/orders/tests/factories.ts`: `createOrder`, `toOrderItem` and `readOrder` build and read orders.
- `src/modules/orders/services/index.ts` and `src/modules/orders/domain/withdrawal.ts`: part of the orders module surface this file depends on. `refundForOrder` and `refundForReturn` are imported from the payments test factories.

## Notes
- The audit port is replaced with `jest.mock`, not spied on. The test comments point to `tests/support/ports.ts` for the reason.
- `jest.restoreAllMocks()` runs in `afterEach`, so spies on the fake provider do not leak between tests.
- Two tests in the "too much" block overlap in what they check (a non-payment currency and a sub-minor-unit amount, expecting 422).
