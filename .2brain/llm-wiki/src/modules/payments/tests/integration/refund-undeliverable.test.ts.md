---
source: src/modules/payments/tests/integration/refund-undeliverable.test.ts
source_sha256: 475b2bf0f29d362c6f07d7d98dcd81b0d8d0f1157c116f1e07532a91cef2108e
context_sha256: 9dbdc96a027f818a8ef83cd2b70ff10bff5693d1748d11696f4694506f97cf57
generated_at: 2026-11-22T07:01:19.971239+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/integration/refund-undeliverable.test.ts

## Purpose
Integration test, run against a real Mongo database with the mailer mocked, for the case where a refund cannot reach the buyer's card. It checks that the buyer gets exactly one `payments.refund-undeliverable` mail that asks how they want the money and gives no reason. It also checks that the buyer-facing payment view reports `owedAnotherWay` instead of "retried automatically". Refusals that say nothing about the buyer's card mail nobody.

## Key elements
- `mockEnqueueEmail`: the jest-mocked `enqueueEmail` from the mailer adapter, which stands in for the mail queue. Cases assert on the mails it received.
- `mailsOf(template)`: filters the mocked calls by template name.
- `settle()`: wraps `settleOutboxNudges` in `eventually`, so the outbox delivers everything written so far.
- `paidOrder()`: builds a user, a product (50.00, 10 on hand) and an order of 2 items, reserves stock and pays by card. It returns `user`, `orderId`, `providerRef` and `refuseWith(reason)`, which makes the fake provider refuse refunds with a `RefundFailureReason`.
- `refund(orderId, amount)`: an operator (admin) refund via `refundOrderPayment`.
- Test groups:
  - **Refused for good:**
    - One mail, with no reason leaked (`lost_or_stolen_card` must not appear in the data), containing the amount, and the buyer view shows `owedAnotherWay: true` with no `failureReason`.
    - The mail stays single when a transient `provider_unavailable` refusal later becomes a final `declined` one, even across two `retryOpenRefunds` calls. `NODE_PAYMENT_REFUND_RETRY_MINUTES` is set to `0` for this case.
    - A refused return refund (`refundForReturn`) also mails.
    - A hand settle (`settleRefundByHand`) clears `owedAnotherWay` and sends `payments.refund-issued` instead.
  - **Refused as `provider_unavailable`, `unknown`, `insufficient_funds` or `disputed`** (`describe.each`): no undeliverable mail and no `owedAnotherWay`.
  - **Settled refund the bank sent back:** a late failure (`expired_or_canceled_card`) is injected with `setFakeLateRefundFailure` and delivered twice via `deliver`. It yields one mail.

## Relationships
- `src/infrastructure/adapters/mailer.ts`: `enqueueEmail` is replaced with a jest mock.
- `scenarios/support/doubles/payments/fake.ts`: supplies `setFakeRefundFailure`, `setFakeLateRefundFailure` and `refundRefOfRecord`, which control the fake provider.
- `src/kernel/events.ts`: `resetDomainEvents` runs in `afterEach`.
- `src/kernel/outbox.ts`: `settleOutboxNudges` flushes the outbox.
- `src/modules/payments/services/index.ts`: the payment service, used for the buyer view, `retryOpenRefunds` and `settleRefundByHand`.
- `src/modules/payments/repository.ts`: the payment repository, used to read the payment and its refunds.
- `src/modules/payments/module.ts`: registered through `registerCheckoutModules([paymentsModule])`.
- `src/modules/payments/tests/factories.ts`: `payByCard`, `refundOrderPayment` and `refundForReturn`.
- `src/modules/payments/tests/deliver.ts`: `deliver` simulates a provider event for the late-failure case.
- `src/modules/inventory/index.ts` and `src/modules/inventory/services/index.ts`: the inventory service, used to reserve stock before payment.
- `src/modules/users/tests/factories.ts`, `src/modules/products/tests/factories.ts` and `src/modules/orders/tests/factories.ts`: create the user, product and order fixtures.
- `src/types/index.ts`: supplies the `RefundFailureReason` type.

## Notes
- Test helpers come from `@tests/*` (`setupTestDb`, `callers`, `eventually`, `environment`, `checkout-modules`). These are not in the neighbor list.
- The `payments.refund-undeliverable` template is asserted by name only. The cases check the `data.body` content (`30.00`) and that `message.to` is defined, not the full mail.
- `afterEach` calls `jest.restoreAllMocks()` after `resetDomainEvents()`, and `beforeEach` clears the mailer mock and re-registers the payments module.
