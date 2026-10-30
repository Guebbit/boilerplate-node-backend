---
source: src/modules/payments/tests/integration/refund-undeliverable.test.ts
sha256: 51872ae703b17ec9b916ef63594ff353023abf87c7e047ba8100b2490af37de4
generated_at: 2026-10-29T05:20:19.625377+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/refund-undeliverable.test.ts

## Purpose

Integration test for the "refund undeliverable" path: when a payment provider permanently refuses a refund (or a bank bounces an already-settled one), the system must notify the buyer exactly once, omit the specific failure reason from the mail, and flag the refund `owedAnotherWay` on the buyer-facing view. Also verifies that non-card-related refusals produce no mail and no flag. Runs against real Mongo with the mailer mocked.

## Key elements

- **`paidOrder()`** — async fixture: creates a user, product, order; reserves inventory; pays 100.00 by card; settles outbox. Returns `{ user, orderId, providerRef, refuseWith }` where `refuseWith` wires the fake to reject subsequent refunds for a given reason.
- **`refund(orderId, amount)`** — convenience wrapper around `refundOrderPayment` with admin caller context.
- **`mailsOf(template)`** — filters `mockEnqueueEmail.mock.calls` by template name; used for all mail assertions.
- **`settle()`** — wraps `settleOutboxNudges` in `eventually` so the test waits for outbox delivery.
- **`describe('a refund the provider refused for good')`** — four tests: single mail with no reason leaked + `owedAnotherWay: true`; transient→final still yields one mail; return-refund path also mails; manual `settleRefundByHand` clears the flag and sends a `refund-issued` mail instead.
- **`describe.each(['provider_unavailable','unknown','insufficient_funds'])`** — parameterised: these reasons must produce **zero** mails and **no** `owedAnotherWay` flag.
- **`describe('a settled refund the bank sent back')`** — uses `setFakeLateRefundFailure` + `applyWebhookDelivery` (called twice) to verify idempotent single-mail delivery for late bank rejections.
- **`jest.mock`** — replaces `enqueueEmail` with a `jest.fn`; all mail assertions go through the mock.

## Relationships

| Neighbor | Interaction |
|---|---|
| `scenarios/support/doubles/payments/fake.ts` | `setFakeRefundFailure`, `setFakeLateRefundFailure`, `refundRefOfRecord` simulate provider/webhook-level refund rejections. |
| `src/infrastructure/adapters/mailer.ts` | Mocked; `enqueueEmail` is the sole mail assertion surface. |
| `src/kernel/events.ts` | `resetDomainEvents()` in `afterEach`. |
| `src/kernel/outbox.ts` | `settleOutboxNudges()` flushes the outbox before mail assertions. |
| `src/modules/inventory/index.ts` | `inventoryService.reserveForOrder` in the `paidOrder` fixture. |
| `src/modules/orders/tests/factories.ts` | `createOrder`, `toOrderItem` to build the order under test. |
| `src/modules/payments/module.ts` | `paymentsModule` registered via `registerCheckoutModules` in `beforeEach`. |
| `src/modules/payments/repository.ts` | `paymentRepository.findByOrderId` to read provider ref and refund IDs. |
| `src/modules/payments/services/index.ts` | `paymentService` — `getForOrder`, `retryOpenRefunds`, `settleRefundByHand`, `applyWebhookDelivery`. |
| `src/modules/payments/tests/factories.ts` | `payByCard`, `refundOrderPayment`, `refundForReturn`. |
| `src/modules/products/tests/factories.ts` | `createProduct`. |
| `src/modules/users/tests/factories.ts` | `createUser`. |
| `src/types/index.ts` | `RefundFailureReason` type annotation on `refuseWith`. |
| `tests/support/callers.ts` | `asAdmin`, `asCustomer`, `callerContextAs` for caller-context plumbing. |

## Notes

- **Real DB, mocked mailer.** `setupTestDb()` provisions real Mongo; only `enqueueEmail` is faked. All outbox side-effects are flushed explicitly via `settle()`.
- **Retry timing override.** The transient→final test sets `NODE_PAYMENT_REFUND_RETRY_MINUTES=0` via `withEnvironmentOverrides` so `retryOpenRefunds` acts immediately instead of waiting a scheduled interval.
- **Reason non-leakage is asserted.** The `lost_or_stolen_card` case explicitly checks the mail body does **not** contain "lost" or "stolen" — the buyer sees only the amount, never the card-specific reason.
- **Idempotency check.** The late-bank-rejection test calls `applyWebhookDelivery` twice and expects exactly one `refund-undeliverable` mail.
- **`describe.each` with `as const`.** The non-card refusal reasons are a literal tuple; adding a new reason to the array automatically generates a new test case.
