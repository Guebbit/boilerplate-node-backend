---
source: src/modules/payments/tests/integration/refund-failed-event.test.ts
sha256: b84b8e67d7adc0319815df30e678fbf9096519c69f5d98298ee31a12f68353c5
generated_at: 2026-10-29T05:19:13.572752+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/refund-failed-event.test.ts

## Purpose
Integration test for the `payment.refund_failed` outbox event. Verifies the deduplication rule (announced once per **new** refusal or **changed** reason; silent on same-reason retries) and the `final` flag semantics (transient refusal → `false`, definite refusal → `true`). Runs against real Mongo with the fake payment provider's refusal lever.

## Key elements
- **`paidOrder()`** — Creates a user, product, and order; pays by card; settles the outbox. Returns `{ orderId, failWith }` where `failWith(reason)` configures the fake provider to refuse the next refund with the given `RefundFailureReason`.
- **`failedEvents()`** — Queries `outboxEventModel` for `PAYMENT_REFUND_FAILED` rows (oldest first) and maps them to their payloads for assertions.
- **Test: "is final for a definite refusal…"** — Sets refusal to `'declined'`, issues a partial refund (30 EUR), asserts a single event with `final: true` and the closed reason.
- **Test: "is not final for a transient refusal, silent on a repeat…"** — Overrides `NODE_PAYMENT_REFUND_RETRY_MINUTES` to `0`; sets `'provider_unavailable'` (transient), retries, asserts `final: false`. Then switches to `'lost_or_stolen_card'`, retries again, asserts both the prior transient event **and** a new `final: true` event appear.

## Relationships
- **`scenarios/support/doubles/payments/fake.ts`** — `setFakeRefundFailure` is the sole lever that makes the fake provider refuse a refund with a chosen reason.
- **`src/kernel/outbox.ts`** — `outboxEventModel` is queried for event assertions; `settleOutboxNudges` flushes pending outbox writes before each assertion.
- **`src/kernel/events.ts`** — `resetDomainEvents` clears in-memory domain-event state after each test.
- **`src/modules/payments/services/index.ts`** — `paymentService.retryOpenRefunds` drives the sweep that re-attempts transient refusals.
- **`src/modules/payments/events.ts`** — Supplies the `PAYMENT_REFUND_FAILED` event-name constant.
- **`src/modules/payments/repository.ts`** — `paymentRepository.findByOrderId` retrieves the payment (and its `providerRef`) to wire the fake's failure lever.
- **`src/modules/payments/module.ts`** — Registered per-test via `registerCheckoutModules`.
- **`src/modules/payments/tests/factories.ts`** — `payByCard` and `refundOrderPayment` perform the payment and refund actions under test.
- **`src/modules/users/products/orders tests/factories.ts`** — Domain entity creation for the paid-order fixture.
- **`src/types/index.ts`** — `RefundFailureReason` union type constrains the reasons used in assertions and the fake's lever.
- **`tests/support/callers.ts`** — `asAdmin` / `callerContextAs` supply authenticated caller context for admin refund calls.
- **`tests/support/checkout-modules.ts`** — `registerCheckoutModules` wires the payments module into the test app.
- **`tests/support/environment.ts`** — `withEnvironmentOverrides` scopes the `NODE_PAYMENT_REFUND_RETRY_MINUTES` override to a single test.

## Notes
- `settleOutboxNudges()` **must** be awaited after every refund or retry call before asserting on outbox rows; otherwise events may still be in-flight.
- The transient-refusal test depends on `NODE_PAYMENT_REFUND_RETRY_MINUTES=0` so that `retryOpenRefunds` fires immediately within the test's time budget.
- The "silent on repeat" behavior is implicit: after the second `retryOpenRefunds` with the **same** reason, no new outbox row appears. The test only asserts on the **changed**-reason transition to keep the silent case covered without an explicit negative assertion.
