---
source: src/modules/payments/tests/integration/announce.test.ts
source_sha256: 7301314f0d73d6744882d03465d2963634df1bbaab63fa1b6affd7287dce1457
context_sha256: 09e24c4f512dcf93046f709a61dbde3806aa49a343f0ef667601e3137347cbc7
generated_at: 2026-11-22T06:55:37.661476+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/integration/announce.test.ts

## Purpose
Integration tests (real Mongo) verifying that `payment.succeeded` and `payment.failed` are announced through the transactional outbox. The event row is written in the same transaction as the settlement or decline, so it exists exactly when the state change committed.

## Key elements
- **`setupTestDb()`**: sets up the real test database.
- **`heard`**: array collecting every `payment.succeeded` a subscriber receives, as `{ orderId, eventId }`. It is reset in `beforeEach`, which also calls `registerCheckoutModules([paymentsModule])` and subscribes via `onDomainEvent`.
- **`afterEach`**: calls `resetDomainEvents()` and `jest.restoreAllMocks()`.
- **`placedOrder()`**: creates a user and a product (`onHand: 10`), then places a real order of quantity 2 through `orderService` as admin.
- **`payFor(orderId, user)`**: runs `createIntent`, then `confirmPayment` with `pm_card_visa`.
- **`awaitingConfirmation()`**: places an order and creates a card intent without confirming it, returning the order id. This is the state a decline lands on.
- **Test groups:**
  - *A settlement that completes*:
    - Exactly one `published` outbox row is created, and the subscriber's `eventId` matches the row `_id`.
    - Confirming the same payment again adds no second row.
  - *A settlement that dies after charging*:
    - If `inventoryService` is made to reject when committing stock for the order, no row is written and nothing is heard. The payment stays `requires_confirmation`.
    - If the order is canceled during `fakePaymentProvider.confirm`, no `payment.succeeded` is announced. The comment says the refund path owns that case.
  - *A declined payment*:
    - `recordDecline` writes the `declined` status and one `payment.failed` outbox row, which is delivered once.
    - If `outboxEventModel.create` is mocked to reject, the decline rolls back and the status stays `requires_confirmation`.
    - If the payment was already `succeeded` (it lost the race), `recordDecline` resolves to no value and writes no row.

## Relationships
- **`@kernel/outbox`**: provides `outboxEventModel` (queried and spied on), `settleOutboxNudges` and `relayOutbox` (flush and deliver rows).
- **`@kernel/events`**: `onDomainEvent` and `resetDomainEvents` for subscribing and cleanup.
- **`payments/events`**: `PAYMENT_SUCCEEDED` and `PAYMENT_FAILED` names.
- **`payments/services`** (`paymentService`) and **`payments/services/announce`** (`recordDecline`): the code under test.
- **`payments/repository`**: `findByOrderId` and `updateStatusIfIn` are used to inspect and force payment state.
- **`payments/module`** is registered through `registerCheckoutModules` from `@tests/checkout-modules`.
- **`orders`** (`orderService`, including `cancelOnRequestById`) and **`inventory`** (`inventoryService`, spied on) supply the real order and stock flow.
- **`fakePaymentProvider`** (`scenarios/support/doubles/payments/fake.ts`): its `confirm` is spied on to cancel the order mid-confirmation.
- **Test helpers**: `createUser`, `createProduct`, and the caller helpers `asCustomer`, `testCallerContext` and `callerContextAs` from `tests/support/callers.ts`.

## Notes
- Failure paths are simulated with `jest.spyOn(...).mockRejectedValueOnce` or `mockImplementationOnce`, so they affect only the next call.
- Tests call `settleOutboxNudges()` and, where delivery matters, `relayOutbox()` before asserting.
