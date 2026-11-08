---
source: src/modules/returns/tests/integration/cancel.test.ts
sha256: cdf89f318316c0dbe87bcbf82f6a8dff7216aa5582fbab68d666690fea6f47df
generated_at: 2026-11-08T08:07:47.448944+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/integration/cancel.test.ts

## Purpose

Integration tests for the `approved → canceled` return transition. They verify that canceling an approved return is purely bookkeeping: no refunds, no stock movement, no domain events, and no outbound email. They also pin down which states reject cancel, and that post-cancel the return is inert (cannot be received or closed).

## Key elements

- **`paidAndDelivered()`** – Fixture builder: creates a user, two products, an order, reserves inventory, confirms a card payment, and marks the order delivered. Returns handles to all created entities.
- **`openedReturn(fixture, reason, approve)`** – Creates a return on the fixture and (unless reason is `'withdrawal'`) approves it. Flushes outbox and clears the mail mock so subsequent assertions are clean.
- **`refundsOf(orderId)`** – Reads the payment's refund list for an order.
- **`describe('canceling an approved return')`** – Happy-path tests: status/timestamp, audit entry shape, timeline row, no side-effects on money/stock/events/mail, returnable-lines are freed, withdrawal cancel, and the `actions.cancel` affordance toggle.
- **`describe('what cannot be canceled')`** – Error-path tests: double-cancel (409 `RETURN_NOT_CANCELABLE`), requested (pending) return, received/closed return, declined return, and 404 for a non-existent id.
- **`describe('after a cancel')`** – Post-cancel invariants: `receiveReturn` and `closeReturnByHand` both reject.
- **`mockEnqueueEmail`** – Jest mock of `enqueueEmail`; asserted never called during cancel.
- **`audited`** (module-level array) – Populated by a registered audit sink; inspected in each test to verify exactly one (or zero) audit row.

## Relationships

- **`src/modules/returns/services/index.ts`** – Provides `returnService`, the system under test.
- **`src/modules/returns/module.ts`** – Registered in `beforeEach` so the service is wired into the test DI container.
- **`src/modules/payments/index.ts` / `services/index.ts` / `module.ts`** – `paymentService` used in the fixture to create/confirm a card payment; `paymentsModule` registered alongside the returns module.
- **`src/modules/inventory/index.ts` / `services/index.ts`** – `inventoryService.reserveForOrder` called in the fixture to hold stock.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `readOrder`, `timelineOf`, `toOrderItem` used to build and inspect orders.
- **`src/modules/products/tests/factories.ts`** – `createProduct`, `countersOf` for product setup and stock assertions.
- **`src/modules/users/tests/factories.ts`** – `createUser` for the customer identity.
- **`src/modules/delivery/tests/factories.ts`** – `carryOrderTo(orderId, 'delivered')` advances the order lifecycle.
- **`src/infrastructure/adapters/mailer.ts`** – `enqueueEmail` is mocked; tests assert it is never called by cancel.
- **`src/infrastructure/observability/audit.ts`** – `registerAuditSink` captures audit entries into `audited` for per-test assertions.
- **`src/kernel/outbox.ts`** – `settleOutboxNudges` flushes pending outbox work; `outboxEventModel.countDocuments` verifies no new events are published.
- **`src/kernel/events.ts`** – `resetDomainEvents` called in `afterEach` to avoid cross-test leakage.

## Notes

- The cancel **note** (free-text admin annotation) is asserted to be *absent* from the order timeline — it is staff-only metadata on the audit row, not a customer-visible field.
- Withdrawal returns are **born approved**; `openedReturn` skips the explicit `approveReturn` call for that reason.
- `openedReturn` calls `settleOutboxNudges()` + `mockEnqueueEmail.mockClear()` after setup so that the approval/ack mails don't pollute the "no mail" assertion in the cancel test.
- The `customers` counter guarantees a unique email per fixture invocation, avoiding user-collision across parallel tests.
- `jest.restoreAllMocks()` in `afterEach` combined with `setupTestDb()` at module scope means each test gets a fresh in-memory database but shares the module-level mock references.
