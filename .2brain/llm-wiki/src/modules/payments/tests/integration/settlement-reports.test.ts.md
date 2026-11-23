---
source: src/modules/payments/tests/integration/settlement-reports.test.ts
source_sha256: ff3fd81558661ee6520260440a53ddede2313b76abbd33cddebae220eb2c0430
context_sha256: a5d7a507739d8151a721e55cb16a44c6a16df8ba458afcb1aa8bb9049b5c61d3
generated_at: 2026-11-22T07:02:51.082306+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/integration/settlement-reports.test.ts

## Purpose
Integration test (real Mongo) asserting that what a payment settlement *reports* — the `payment.failed` outbox event, the audit row and the analytics event — is emitted once per real state transition. Repeated confirms, webhooks and syncs of the same outcome must not re-announce it, while genuinely distinct attempts still count separately.

## Key elements
- `jest.mock` of `@infrastructure/observability/audit` and `.../analytics`: the audit port is replaced with `auditPortMock()` from `@tests/ports`; analytics keeps the real module but swaps `emitAnalyticsEvent` for `jest.fn()`.
- `setupTestDb()` and a `beforeEach` that calls `registerCheckoutModules([paymentsModule])`. `afterEach` calls `resetDomainEvents()` and `jest.restoreAllMocks()`.
- `openIntent()`: creates a user and a product (`onHand: 10`), places an order of quantity 2 as admin, then creates a card payment intent as the customer. Returns `{ user, orderId, paymentId }`.
- `confirmWith(paymentId, user, method)`: runs `paymentService.confirmPayment` as the owning customer.
- `failedRows()`: awaits `settleOutboxNudges()`, then counts `outboxEventModel` documents named `PAYMENT_FAILED`.
- Test groups:
  - **A declined payment**:
    - A confirm followed by `applyWebhookSettlement` and `syncPayment` yields one `payment.failed` row.
    - Two declined confirms (card A, then card B) yield two rows.
    - Repeated polling yields one `PAYMENT_FAILED` audit event and one `PAYMENT_DECLINED` analytics event.
  - **A payment that already succeeded**: repeated syncs after a `pm_card_visa` confirm yield one `PAYMENT_CONFIRMED` audit event and one `PAYMENT_SUCCEEDED` analytics event.
  - **A confirm that loses the race**: the confirm returns the payment's current status (`succeeded`), not the stale pre-read.

## Relationships
- `@modules/payments/services` (`paymentService`): the system under test (`createIntent`, `confirmPayment`, `syncPayment`, `applyWebhookSettlement`).
- `@modules/payments/repository`: `findByOrderId` reads the stored `providerRef`; `updateStatusIfIn` simulates the webhook winning the race.
- `@modules/payments/events`, `audit` and `analytics`: provide the `PAYMENT_FAILED` event name, `paymentsAuditActions` and `paymentsAnalyticsEvents` used in assertions.
- `@modules/payments/module`: registered via `registerCheckoutModules`.
- `@modules/orders` (`orderService`): creates the order the payment belongs to.
- `@kernel/events` and `@kernel/outbox`: `resetDomainEvents`, plus `outboxEventModel` and `settleOutboxNudges` for counting emitted events.
- `@infrastructure/observability/audit` and `.../analytics`: mocked ports whose calls are inspected via `observePort`.
- `fakePaymentProvider` (`@scenarios/support/doubles/payments/fake`): the provider double. In the race test its `confirm` is spied on.
- `@modules/users/tests/factories` and `@modules/products/tests/factories`: `createUser` and `createProduct` fixtures.

## Notes
- The race test wraps the fake provider's `confirm` with `mockImplementationOnce`. The wrapper marks the payment `succeeded` through `updateStatusIfIn(orderId, ['requires_confirmation'], 'succeeded')` before returning the provider's state.
- Audit and analytics are replaced rather than spied on; the comment points to `tests/support/ports.ts` for the reason.
- Card behaviour is driven by the method string: `pm_card_declined` and `pm_card_visa`.
- Order creation uses an admin caller context, while payment actions use `asCustomer(user.id)`.
