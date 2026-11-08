---
source: src/modules/payments/tests/integration/refund-undeliverable.test.ts
sha256: 28ed31b4d0cdf1e7014455cc517d8fb961515d52798b6415575b4308e8493bc6
generated_at: 2026-11-08T07:36:13.058718+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/refund-undeliverable.test.ts

## Purpose

Integration tests covering the "refund undeliverable" flow: when a card refund is permanently refused (lost/stolen card, declined) or an already-settled refund is reversed by the bank, the buyer receives exactly one email with no reason stated, and the buyer-facing refund view exposes `owedAnotherWay` instead of a retry message. Also verifies that transient or non-card-specific failures mail nobody, and that a manual settle clears the undeliverable state in favour of a success mail.

## Key elements

- **`paidOrder()`** – Sets up a user, product, order (2 × 50.00), reserves inventory, and pays by card. Returns a `refuseWith(reason)` lever wired to the fake payment provider so any subsequent refund can be refused with a chosen `RefundFailureReason`.
- **`refund(orderId, amount)`** – Shorthand that calls `refundOrderPayment` with an admin caller context.
- **`mailsOf(template)`** – Filters the mocked `enqueueEmail` call log to a specific template name for assertion.
- **`settle()`** – Wraps `settleOutboxNudges()` inside `eventually` so the outbox drains before assertions run.
- **`describe('a refund the provider refused for good')`** – Four tests: single mail without reason, one-mail guarantee across transient→final transitions, return-refund path, and manual-settle clearing `owedAnotherWay`.
- **`describe.each(['provider_unavailable','unknown','insufficient_funds'])`** – Parameterised block asserting zero mails and no `owedAnotherWay` for non-card-specific reasons.
- **`describe('a settled refund the bank sent back')`** – Simulates a late webhook (`applyWebhookDelivery` called twice for idempotency) on an already-settled refund; expects exactly one undeliverable mail.

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** – Provides `setFakeRefundFailure`, `setFakeLateRefundFailure`, and `refundRefOfRecord` to script provider rejections and late webhook failures.
- **`src/infrastructure/adapters/mailer.ts`** – Fully mocked via `jest.mock`; `enqueueEmail` is the sole spy target for all mail assertions.
- **`src/kernel/events.ts`** – `resetDomainEvents` called in `afterEach` to isolate event-bus state.
- **`src/kernel/outbox.ts`** – `settleOutboxNudges` is the mechanism that actually delivers queued emails; tests depend on it completing before asserting.
- **`src/modules/inventory/services/index.ts`** – `inventoryService.reserveForOrder` is required before `payByCard` can succeed.
- **`src/modules/payments/services/index.ts`** – `paymentService` is the primary SUT: `retryOpenRefunds`, `settleRefundByHand`, `applyWebhookDelivery`, `getForOrder`.
- **`src/modules/payments/repository.ts`** – `paymentRepository.findByOrderId` used to read `providerRef` and refund IDs directly from Mongo.
- **`src/modules/payments/module.ts`** – Registered in `beforeEach` so DI wiring is available.
- **`src/modules/payments/tests/factories.ts`** – `payByCard`, `refundForReturn`, `refundOrderPayment` provide domain-level test actions.
- **`src/modules/orders/tests/factories.ts`**, **`src/modules/products/tests/factories.ts`**, **`src/modules/users/tests/factories.ts`** – Entity creation helpers for the preconditions.
- **`tests/support/callers.ts`** – `asAdmin`, `asCustomer`, `callerContextAs` build the caller/authentication context for service calls.
- **`src/types/index.ts`** – `RefundFailureReason` union type constrains the refusal reasons used in tests.

## Notes

- Only the mailer is mocked; the database is real Mongo (`setupTestDb`). All payment, order, and inventory state is read back from the DB.
- The tests deliberately assert that the failure **reason string is absent** from the email body (`/lost|stolen/i` check) and from the buyer view (`failureReason` property absent) — this is a security/UX contract, not incidental.
- One test overrides `NODE_PAYMENT_REFUND_RETRY_MINUTES` to `'0'` to collapse the retry backoff, allowing two consecutive `retryOpenRefunds` calls within the same tick.
- `applyWebhookDelivery` is invoked twice with identical arguments to confirm the late-failure webhook is idempotent (one mail, not two).
- The `paidOrder` helper charges 100.00 total (2 × 50.00) so partial refunds (30.00) and return refunds (50.00) are both within the paid amount.
