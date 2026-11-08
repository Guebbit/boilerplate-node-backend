---
source: src/modules/payments/tests/integration/refunds.test.ts
sha256: 12ee9d455c99517fc01f71fc57834902ab0ccda0e0f43c8f378b77d857dd76f6
generated_at: 2026-11-08T07:36:31.641985+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/refunds.test.ts

## Purpose

Integration tests for the refund flow against a real Mongo database. They verify the conditional-write guarantees that make partial refunds safe: a refund row is opened *before* the provider is called, so racing refunds cannot over-refund, a provider failure leaves the record open for the sweep to retry with the same idempotency key, and the payment's `amountRefunded` always sums correctly in minor units.

## Key elements

- **`paidOrder()`** — builds a 100.00 EUR paid card order (one product, two units at 50.00) and flushes the outbox so the settlement rows are visible.
- **`paymentOf(orderId)`** — fetches the payment via `paymentRepository`; throws on missing (a test bug, not a domain state).
- **`refund(orderId, body?)`** — shorthand for `refundOrderPayment` as an admin caller.
- **`describe('a partial refund')`** — asserts refund records, `amountRefunded` accumulation, provider call isolation (distinct idempotency keys), and `PAYMENT_REFUNDED` event payloads (including the `full` flag).
- **`describe('a refund that asks for too much')`** — 422/409 validation errors, the race-condition guard (two concurrent 60.00 refunds → exactly one succeeds), and the sweep-settles-first scenario (provider call blocked while `retryOpenRefunds` runs; the caller still sees success).
- **`describe('a refund the provider refuses')`** — provider rejection leaves the refund row as `failed` with a sanitized reason; the raw provider error never reaches the wire.

## Relationships

| Neighbor | Interaction |
|---|---|
| `scenarios/support/doubles/payments/fake.ts` | Supplies `fakePaymentProvider`, the in-memory provider double that records calls and can be spied on / mocked per-test. |
| `src/infrastructure/observability/audit.ts` | **Replaced** (not spied) via `jest.mock` → `auditPortMock()` so tests can assert audit entries without the real sink. |
| `src/kernel/events.ts` | `onDomainEvent` / `resetDomainEvents` capture and clean up `PAYMENT_REFUNDED` handlers between tests. |
| `src/kernel/outbox.ts` | `settleOutboxNudges` drains the outbox relay so async settlement rows are readable before assertions. |
| `src/modules/orders/tests/factories.ts` | `createOrder`, `toOrderItem`, `readOrder` build the order fixture. |
| `src/modules/payments/module.ts` | `paymentsModule` is registered in `beforeEach` so DI routes the service to the fake provider. |
| `src/modules/payments/repository.ts` | `paymentRepository.findByOrderId` backs `paymentOf`. |
| `src/modules/payments/events.ts` | Exports the `PAYMENT_REFUNDED` constant used for event assertions. |
| `src/modules/payments/presenter.ts` | `presentPayment` used to shape the response under test. |
| `src/modules/payments/providers/index.ts` | Re-exports `PaymentProviderError` for type-level checks. |
| `src/modules/payments/audit.ts` | `paymentsAuditActions` referenced for audit-action assertions. |

## Notes

- **Real Mongo, not mocks.** The tests exist specifically to prove the conditional writes (compare-and-swap on `amountRefunded` + `refunds` array) hold under concurrency. Replacing Mongo with an in-memory store would defeat the purpose.
- **Audit is port-replaced, not spied.** The file header explicitly calls this out ("Replaced, not spied on — see `tests/support/ports.ts` for why"). Use the port mock pattern if you add assertions here.
- **`settleOutboxNudges()` is load-bearing.** The outbox relay publishes settlement rows asynchronously; omitting the call after a refund that transitions status can cause flaky "no payment" failures in follow-up assertions.
- **Sweep test uses `withEnvironmentOverrides`.** Setting `NODE_PAYMENT_REFUND_RETRY_MINUTES: '0'` forces the sweep to run synchronously inside the mocked provider call, exercising the "opener lost the conditional settle but money went back" edge.
- **`paymentOf` throws, it does not return `null`.** If a test sees `null`, the setup is broken; do not add null-handling around it.
