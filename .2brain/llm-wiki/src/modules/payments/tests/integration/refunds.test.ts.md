---
source: src/modules/payments/tests/integration/refunds.test.ts
sha256: a92bc4d3c8e5591947844c388b8de72eb4efce107783f06e7964dd45af554068
generated_at: 2026-10-29T05:20:39.490439+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/refunds.test.ts

## Purpose

Integration tests for the payment-refund flow, run against a real MongoDB instance. Verifies the invariants that conditional Mongo writes enforce: partial refunds leave the remainder refundable, two racing refunds cannot overdraw, the provider is called with only the refunded slice under a unique idempotency key, and a provider refusal leaves the record in a recoverable state for the sweep.

## Key elements

- **`paidOrder()`** — Creates a user, a 50.00 product (2 units), an order, and a card payment of 100.00 EUR. Calls `settleOutboxNudges()` so the settlement row is relayed before any subsequent test action.
- **`paymentOf(orderId)`** — Fetches the payment via `paymentRepository.findByOrderId`; throws on missing (test error, not a nullable path).
- **`refund(orderId, body)`** — Wraps `refundOrderPayment` with admin caller context; optional `amount`/`currency` override.
- **`describe('a partial refund')`** — Asserts status stays `succeeded`, `amountRefunded` accumulates, no-amount defaults to the remainder, minor-unit sums are exact, each provider call carries its own idempotency key, and `PAYMENT_REFUNDED` events fire once per refund with a correct `full` flag.
- **`describe('a refund that asks for too much')`** — Covers 422 over-remaining, 422 wrong/unsupported currency, 409 on empty no-amount refund, racing-refund exclusion (only one of two 60-unit refunds lands), and the sweep-settles-open-refund race (opener still in-flight when sweep finishes).
- **`describe('a refund the provider refuses')`** — Verifies the record stays `failed` with a closed reason, the provider's raw error string is never exposed on the wire, and the caller still receives a 201. *(File truncated here; additional cases likely follow.)*
- **Jest mock of `@infrastructure/observability/audit`** — Replaced (not spied) with `auditPortMock` from `@tests/ports` so audit side-effects are captured without touching the real port.

## Relationships

- **`fake.ts`** (scenarios doubles) — Supplies `fakePaymentProvider`; tests spy on / mock-reject its `refund` method to simulate provider behaviour.
- **`events.ts`** (kernel) — `onDomainEvent` / `resetDomainEvents` used to capture and clean up `PAYMENT_REFUNDED` listeners.
- **`outbox.ts`** (kernel) — `settleOutboxNudges` flushes the outbox relay so settlement rows are visible before assertions.
- **`orders/tests/factories.ts`** — `createOrder`, `toOrderItem`, `readOrder` build the order fixture.
- **`payments/module.ts`** — Registered via `registerCheckoutModules` in `beforeEach` so the HTTP routes are live.
- **`payments/repository.ts`** — `paymentRepository.findByOrderId` is the read path for assertions.
- **`payments/model.ts`** — `paymentModel` imported (likely for direct Mongo assertions not visible in the truncated portion).
- **`payments/audit.ts`** — `paymentsAuditActions` imported for audit-action assertions.
- **`payments/presenter.ts`** — `presentPayment` imported; likely used to assert the response shape.
- **`payments/providers/index.ts` / `providers/errors.ts`** — `PaymentProviderError` used for typed provider-failure cases.
- **`payments/events.ts`** — `PAYMENT_REFUNDED` constant for event subscription.
- **`infrastructure/observability/audit.ts`** — The real audit port, replaced by the mock (see above).

## Notes

- **Real Mongo, no in-memory DB.** The file header is explicit: the guarantees under test *are* the conditional writes; mocking the store would defeat the purpose.
- **Audit is replaced, not spied.** The `jest.mock` comment points to `tests/support/ports.ts` for the rationale (avoids real I/O while still recording calls).
- **`settleOutboxNudges()` timing.** Must be called before any action that depends on the settlement row existing, because the relay publishes rows asynchronously after the HTTP response.
- **Sweep-race test** uses `withEnvironmentOverrides` to set `NODE_PAYMENT_REFUND_RETRY_MINUTES` to `0` and injects a `mockImplementationOnce` on the fake provider that triggers `paymentService.retryOpenRefunds()` mid-flight.
- **Amounts are minor-unit integers internally.** The 0.10 + 0.20 drift test confirms the codebase avoids floating-point arithmetic on money.
- **`asReject` / `asAdmin` / `callerContextAs`** come from `@tests/response` and `@tests/callers` helpers (not listed as graph neighbors but imported).
