---
source: src/modules/payments/tests/integration/hand-refund.test.ts
sha256: acb1d3744ffdcfc082f5b5b6cb73d53a2595ff7e7a558510ad8bd54aea8e2e86
generated_at: 2026-11-14T21:15:02.234819+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/hand-refund.test.ts

## Purpose

Integration tests for the operator-side hand-refund lifecycle on offline (cash) payments. Every path that opens a refund record is verified to leave it `pending`; `settleRefundByHand` is the single action that flips it to `succeeded`. The tests run against a real MongoDB instance and exercise the system only through `paymentService`'s public API.

## Key elements

- **`cashOrder()`** – Seeds a user, a product (50.00 × 2), an order, and records a 100.00 offline cash payment via `paymentService.recordOfflinePayment`.
- **`paymentOf(orderId)`** – Fetches the stored payment document through the payments repository.
- **`owedRows()`** – Filters the in-memory `audited` array to rows where `action === 'payment.refund_owed_by_hand'`.
- **`settle(paymentId, refundId)`** – Calls `paymentService.settleRefundByHand` as an admin caller.
- **`describe('the operator refunding a cash payment')`** – Verifies a single partial refund opens one `pending` record, emits one `PAYMENT_REFUND_OWED_BY_HAND` outbox event and one audit row, and emits **no** `PAYMENT_REFUNDED` event.
- **`describe('the cancel listener on a cash payment')`** – Confirms the cancellation listener is idempotent (duplicate delivery writes nothing extra) and that it opens the *remaining* amount when a partial operator refund already exists.
- **`describe('settleRefundByHand')`** – Covers: settling one named record (status flag, `PAYMENT_REFUNDED` outbox, `admin.payment.refund_settled_by_hand` audit, other records untouched); 409 `PAYMENT_REFUND_NOT_OPEN` on double-settle; 409 `PAYMENT_REFUND_IN_FLIGHT` on a card refund the provider left failed; 404 on an unknown refund id; and that the action is surfaced to any caller holding `create:Refund` (admin *and* moderator).
- **`describe('refundLegalDue')`** – Verifies `paymentService.refundLegalDue` returns `undefined` when no deadline is stamped or the refund id is missing, and `{ dueBy, dueRule }` when the refund carries both fields.

## Relationships

- **`src/modules/payments/services/index.ts`** – `paymentService` is the sole API under test (`recordOfflinePayment`, `settleRefundByHand`, `getForOrder`, `refundLegalDue`).
- **`src/modules/payments/repository.ts`** – The repository is used to read the persisted payment document for assertions.
- **`src/modules/payments/events.ts`** – `PAYMENT_REFUND_OWED_BY_HAND` and `PAYMENT_REFUNDED` event names are queried from the outbox.
- **`src/kernel/outbox.ts`** – `outboxEventModel` is read to assert deferred events; `settleOutboxNudges()` flushes them before assertions.
- **`src/kernel/events.ts`** – `resetDomainEvents()` is called in `afterEach` to clear the domain-event bus.
- **`src/modules/payments/module.ts`** – `paymentsModule` is registered via `registerCheckoutModules` in `beforeEach` to wire the service to the repository.
- **`src/infrastructure/observability/audit.ts`** – `registerAuditSink` captures audit entries into the local `audited` array; `AuditEntry` is the row type.
- **`src/modules/payments/tests/factories.ts`** – `refundOrderPayment`, `refundForOrder`, and `payByCard` provide higher-level test actions (operator refund, cancel-listener simulation, card payment).
- **`scenarios/support/doubles/payments/fake.ts`** – The fake payment provider is spied on in the in-flight card-refund test to simulate a provider failure.
- **`tests/support/checkout-modules.ts`** – `registerCheckoutModules` wires the payments module into the test app.
- **`tests/support/callers.ts`** – `asAdmin`, `asModerator`, `callerContextAs` supply caller identity and context for service calls.
- **`src/modules/users/tests/factories.ts`**, **`src/modules/products/tests/factories.ts`**, **`src/modules/orders/tests/factories.ts`** – Seed the user, product, and order documents required by `cashOrder()`.

## Notes

- `settleOutboxNudges()` **must** be called before asserting on `PAYMENT_REFUNDED` rows in `outboxEventModel`; the event is enqueued lazily and only materialises after the nudge.
- The audit sink is a module-level array (`audited`) reset in every `beforeEach`; there is no per-test isolation beyond that reset.
- `fakePaymentProvider` is **not** a stand-in for the service layer—it only replaces the external gateway in the single in-flight-card-refund test. All other paths go through the real service code.
- The test asserts a *negative* audit check: `admin.payment.refunded` must **not** appear, distinguishing the hand-settle path from the card-refund path.
- Permission model tested: `settleRefundByHand` is offered based on the `create:Refund` key, so a moderator sees the action just as an admin does.
