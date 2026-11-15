---
source: src/modules/payments/tests/integration/timeline.test.ts
sha256: 960c72426d9be04c1370eb978308b52fc52fd9ca1da4407d74c88fce2e11d1e7
generated_at: 2026-11-14T21:20:52.448206+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/timeline.test.ts

## Purpose

Integration tests that verify the exact timeline entries the payments module writes onto an order: a `paid` row (card or offline), a single `payment_declined` row, and the three refund moments (`refund_issued`, `refund_settled`, `refund_failed`). Runs against real Mongo through the services' public API to confirm row shape, actor attribution, closed-code usage (never raw provider text), and role-based visibility.

## Key elements

- **`paidOrder()`** — async helper that creates a user, a product (50.00 × 2), an order, and confirms a card payment via `paymentService`. Returns `{ user, orderId }`.
- **`refund(orderId, amount)`** — wraps `refundOrderPayment` from the payments test factory, acting as `admin-1`.
- **`describe('the payment')`** — three tests: card `paid` row has no actor; offline `paid` row names the cashier and method; `recordDecline` is idempotent (second call's result is asserted via `toBeNull()`, only one timeline row exists).
- **`describe('a refund')`** — four tests:
  - Issue + settlement both carry operator, amount, currency, reason, and a shared `refundId`.
  - Failure stores a closed code (`insufficient_funds`), never the provider's raw wording.
  - Retry sweep: repeated same-reason failures produce no new row; a *new* reason does. Stored `attempts` counter increments (verified via the repository).
  - `refund_failed` is invisible to the buyer (`timelineAs` as customer) but visible to staff.

## Relationships

- **`src/modules/payments/services/index.ts`** — primary SUT: the public payment service used for intent creation, confirmation, offline recording, and refund retry.
- **`src/modules/payments/services/announce.ts`** — `recordDecline` called directly to test idempotency.
- **`src/modules/payments/tests/factories.ts`** — `refundOrderPayment` drives every refund scenario.
- **`src/modules/payments/module.ts`** — `paymentsModule` registered per-test via `registerCheckoutModules` so the DI container is available.
- **`src/modules/payments/providers/index.ts`** — exports `PaymentProviderError`, used to construct deterministic provider failures.
- **`scenarios/support/doubles/payments/fake.ts`** — `fakePaymentProvider` is spied on to inject refund rejections.
- **`src/modules/payments/repository.ts`** — read back to assert the stored `attempts` count after retries.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem`, `timelineOf`, `timelineAs` provide setup and the assertion surface.
- **`src/modules/orders/index.ts`** — the order service used in the offline-payment and decline tests to create orders without the payment intent flow.
- **`src/modules/users/tests/factories.ts`** / **`src/modules/products/tests/factories.ts`** — create fixture users and products.
- **`tests/support/callers.ts`** — `asCustomer`, `asAdmin`, `callerContextAs`, `testCallerContext` supply the actor/role context for every service call.
- **`src/kernel/events.ts`** — `resetDomainEvents` in `afterEach` to prevent cross-test event bleed.

## Notes

- **Closed-code invariant is explicitly asserted**: `expect(JSON.stringify(rows)).not.toContain('raw provider text')` guards against leaking provider wording into timeline data.
- **Role-based visibility**: `refund_failed` rows are filtered out for the buyer role but present for admin. This is a product rule encoded in the query layer, not in the write path.
- **Retry-row semantics**: re-failing with the *same* `failureReason` overwrites in place (no new timeline row); a *different* reason appends a new `refund_failed` row. The test asserts both.
- **`refundId` union check**: the `('refundId' in data ? data.refundId : '')` guard is a TypeScript narrowing workaround for the discriminated-union `data` type; it is not a runtime feature.
- **`withEnvironmentOverrides`** sets `NODE_PAYMENT_REFUND_RETRY_MINUTES: '0'` so `retryOpenRefunds` can be called synchronously in-test without waiting.
- All tests go through the services' public API (no direct repository writes), except the final assertion in the retry test which reads back via the repository to verify the `attempts` counter.
