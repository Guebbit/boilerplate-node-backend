---
source: src/modules/payments/tests/integration/settlement-mismatch.test.ts
source_sha256: 6f8de6229148d16d6e7b2aad76305d4b5bae30c0922f42958334a7eaaf64d296
context_sha256: b06988b23d4355d3f3051bd214f005e763ca62e1882ec86d1c3c03fa462e04a5
generated_at: 2026-11-22T07:02:40.870615+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/integration/settlement-mismatch.test.ts

## Purpose
Integration test (real Mongo, real `fake` payment provider) covering the case where a provider reports `succeeded` for money that isn't the payment that was frozen: a different amount, currency, or payment id. The expected outcome is that nothing is accepted. The order is canceled, the collected money is refunded through the existing refund path, and no `payment.succeeded` event, stock commit, or invoice results.

## Key elements
- `jest.mock('@infrastructure/observability/audit', ...)`: replaces the audit port with `auditPortMock()` from `@tests/ports`. The comment explains that `jest.spyOn` can't redefine the non-configurable getter on a CommonJS namespace import.
- `setupTestDb()` and a `beforeEach` that registers `paymentsModule` and `invoicingModule` via `registerCheckoutModules`. `afterEach` calls `resetDomainEvents()` and `jest.restoreAllMocks()`.
- `openIntent()`: creates a user, a product (25.00, 10 on hand), a 2-unit order (50.00), and a payment intent. Returns `user`, `product`, `orderId`, `paymentId` and `providerRef`.
- `MISMATCHES` with `describe.each`: one row each for `amount`, `currency` and `paymentId`. The main test is run per field and asserts:
  - the confirm answers 409 `PAYMENT_ORDER_NOT_PAYABLE`;
  - the order is `canceled`;
  - the payment is `succeeded` with exactly one refund;
  - there is no `PAYMENT_SUCCEEDED` outbox event;
  - exactly one `PAYMENT_AMOUNT_MISMATCH` outbox event, with the expected payload (`fields`, `expected`, `received`);
  - no invoice;
  - stock counters are restored to `{ onHand: 10, reserved: 0, available: 10 }`;
  - `paymentAmountMismatchTotal` has a sample labeled with that field.
- `describe('a mismatch recorded')`:
  - The payment's stored amount becomes what arrived (`47.50`), and the refund uses the same amount.
  - The canceled order can't be hard-deleted (`ORDER_HAS_MONEY_HISTORY`).
  - The audit row is `payment.amount_mismatch`, with outcome `failure`, target type `payment`, and `SYSTEM_ACTOR` as the actor. The action is not under `security.*`.
  - The rejection does not include `PAYMENT_DECLINED`.
- `describe('the other doors into the same settlement')`:
  - `syncPayment` returns the same 409 and cancels the order.
  - A webhook delivered through `deliver()` is acknowledged without error, and the order is still canceled and refunded.
  - A provider payment id is truncated to 64 characters in the event payload.
  - When the provider names a currency but no amount (`confirm` mocked), the payment keeps the frozen amount and currency (`50.00` / `EUR`), and the event's `fields` are `['currency', 'amount']`.

## Relationships
- `scenarios/support/doubles/payments/fake.ts`: supplies `setFakeReceipt(providerRef, receipt)`, which tells the fake provider what to report, and `fakePaymentProvider`, whose `confirm` is called directly or spied on.
- `src/infrastructure/observability/audit.ts`: its `emitAuditEvent` is replaced by the mock and then observed via `observePort`.
- `src/modules/payments/audit.ts`: the payments audit actions are checked so the mismatch action does not start with `security.`.
- `src/kernel/events.ts`: `resetDomainEvents` is used in `afterEach`.
- `src/kernel/outbox.ts`: `outboxEventModel` is queried for events, and `settleOutboxNudges` is awaited before asserting.
- `src/kernel/permissions.ts`: `SYSTEM_ACTOR` is the expected audit actor.
- `src/modules/orders/*`: `orderService` (`getById`, `removeById`) and `createOrder`/`toOrderItem` from the orders test factories are used for setup and checks.
- `src/modules/invoicing/*`: `invoicingModule` is registered, and the invoicing service is used to confirm no invoice exists for the order.
- `src/infrastructure/http/response.ts` and `src/infrastructure/i18n/*`: `generateReject` and `t` are imported. In the visible portion they are not used.
- `src/modules/orders/index.ts` and `src/modules/orders/services/index.ts`: the order service is imported through `@modules/orders`.

## Notes
- Each `MISMATCHES` row sets only one field. The other receipt fields default to the frozen values.
- Provider-reported values overwrite the frozen amount on the payment record, so the refund returns what was actually collected.
- A mismatch yields `PAYMENT_ORDER_NOT_PAYABLE`, not a decline.
