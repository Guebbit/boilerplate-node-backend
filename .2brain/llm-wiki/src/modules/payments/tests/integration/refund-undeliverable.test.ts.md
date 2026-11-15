---
source: src/modules/payments/tests/integration/refund-undeliverable.test.ts
sha256: 91e7eba42047aa700cd0b88e23d86a9dc45c9a7fbb5078122e5e226b8d559b7f
generated_at: 2026-11-14T21:18:08.339352+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/refund-undeliverable.test.ts

## Purpose

Integration tests for the "undeliverable refund" flow: when a payment provider cannot deliver a refund to the buyer's card, the system mails the buyer exactly once (with no reason disclosed), marks the refund as `owedAnotherWay` in the buyer-facing view, and—critically—does **not** mail when the refusal reason is unrelated to the buyer's card. Uses a real MongoDB; the mailer is mocked.

## Key elements

- **`paidOrder()`** – Builds a user, a product (price 50.00), an order for 2 units, reserves inventory, pays by card, settles the outbox, and returns a `refuseWith(reason)` lever that arms the fake provider to refuse the next refund for that `providerRef`.
- **`refund(orderId, amount)`** – Convenience wrapper that calls `refundOrderPayment` with an admin caller context.
- **`settle()`** – Polls until `settleOutboxNudges()` has flushed all queued work.
- **`mailsOf(template)`** – Filters the mocked `enqueueEmail` call history by template name for assertions.
- **`describe('a refund the provider refused for good')`** – Four cases: single mail without reason + `owedAnotherWay: true`; idempotency when a transient refusal becomes final; return-refund path also mails; hand-settle clears `owedAnotherWay` and sends the success mail instead.
- **`describe.each(['provider_unavailable', 'unknown', 'insufficient_funds', 'disputed'])`** – Verifies that non-card-related refusal reasons produce **zero** mails and no `owedAnotherWay` flag.
- **`describe('a settled refund the bank sent back')`** – Simulates a late webhook via `deliver()` after the refund already settled; asserts the same single-mail behavior.

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** – Provides `setFakeRefundFailure`, `setFakeLateRefundFailure`, and `refundRefOfRecord`; the levers that arm the fake provider to refuse refunds or report a late failure.
- **`src/infrastructure/adapters/mailer.ts`** – Fully mocked; `enqueueEmail` is the sole mail assertion target.
- **`src/kernel/outbox.ts`** – `settleOutboxNudges` is called to flush domain events and trigger side-effects (mailing, state transitions).
- **`src/kernel/events.ts`** – `resetDomainEvents` in `afterEach` prevents cross-test leakage.
- **`src/modules/payments/services/index.ts`** – Exports `paymentService`; the test calls `getForOrder` (buyer view), `retryOpenRefunds` (retry exhaustion), and `settleRefundByHand` (operator override).
- **`src/modules/payments/repository.ts`** – Exports `paymentRepository`; `findByOrderId` is used to inspect persisted refund records.
- **`src/modules/payments/module.ts`** – Registered via `registerCheckoutModules` in `beforeEach`.
- **`src/modules/payments/tests/deliver.ts`** – `deliver()` simulates a provider webhook event for the late-refund scenario.
- **`src/modules/payments/tests/factories.ts`** – `payByCard`, `refundOrderPayment`, `refundForReturn` build the payment/refund records under test.
- **`src/modules/inventory/index.ts`** – Exports `inventoryService`; `reserveForOrder` is called in `paidOrder()` so the order is in a payable state.
- **`src/modules/inventory/services/index.ts`** – Underlying service implementation re-exported through the module index.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `toOrderItem`.
- **`src/modules/users/tests/factories.ts`** / **`src/modules/products/tests/factories.ts`** – `createUser`, `createProduct`.
- **`src/types/index.ts`** – `RefundFailureReason` union type used to classify card-related vs. non-card refusal reasons.

## Notes

- **Card-related vs. non-card reasons is the core dichotomy.** Card-related (`lost_or_stolen_card`, `declined`, `expired_or_canceled_card`) triggers the mail; non-card (`provider_unavailable`, `unknown`, `insufficient_funds`, `disputed`) does not. This is the behavior contract under test.
- The mail body must contain the refund amount but must **not** contain the refusal reason (asserted via regex on serialized data).
- `NODE_PAYMENT_REFUND_RETRY_MINUTES: '0'` is set via `withEnvironmentOverrides` in the transient→final test to force immediate retry so two calls to `retryOpenRefunds` exhaust the retry window without real waiting.
- `retryOpenRefunds` is called **twice** deliberately to ensure both retry attempts have been consumed before asserting the single mail.
- The late-refund test calls `deliver` **twice** (idempotency check) and still expects exactly one mail.
