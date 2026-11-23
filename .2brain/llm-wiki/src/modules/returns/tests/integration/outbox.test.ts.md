---
source: src/modules/returns/tests/integration/outbox.test.ts
source_sha256: 15cc3e59b36fd14a68dfb17db7afcda435668eac4f259641db080ff7b43ea3a5
context_sha256: c7bd0cf61b191169f0fa99289b22d251f9c9d31e14099483e094ed7770c355c0
generated_at: 2026-11-22T07:35:08.315930+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/tests/integration/outbox.test.ts

## Purpose
Integration tests (real Mongo) verifying that return events use the transactional outbox. Each event row must commit atomically with the write it announces, be keyed on the order ID (`aggregateId`) so one order's events stay ordered, and reach the in-process bus via the relay. The suite covers `return.requested`, `return.decided`, `return.received` and `return.closed`.

## Key elements
- `setupTestDb()` and a `beforeEach` that calls `registerCheckoutModules([paymentsModule, returnsModule])`. `afterEach` restores all spies.
- `orderIn(status)`: creates a unique user, a "Shirt" product and a two-item order forced to `status`. For `shipped` or `delivered` it starts the order as `processing` and moves it with `carryOrderTo`, so the shipments really exist. It also calls `setWithdrawUntil` to put the withdrawal window seven days ahead.
- `returnRows()`: queries `outboxEventModel` for the requested, received and closed events, oldest first.
- `approvedReturn()`: builds a paid, delivered order with reserved inventory and a card payment. It opens a `defective` return and approves it as admin, returning `{ id, orderId, shirt }`.
- Test groups:
  - **`return.requested`**:
    - The row is written with the return, keyed on the order, and published by the relay. An `onDomainEvent` listener receives the expected payload and the row `_id` as `eventId`.
    - If `outboxEventModel.create` fails, `createReturn` rejects and no return or row remains.
  - **`return.decided`**: approve and decline each write one row with the matching `decision`. A repeated approval that lost the race writes no second row.
  - **Withdrawal before dispatch**: a `withdrawal` return on a `paid` order writes `requested` then `closed`, both published and keyed on the order.
  - **`return.received` and `return.closed`**:
    - Receiving writes `received` and restocks the product, then writes `closed` once the money is settled.
    - If the outbox write fails, the return stays `approved`, stock counters are unchanged and no `received` row exists.
    - Calling `closeReturn` twice announces only once, because the second call resolves to a nullish result.

## Relationships
- `@kernel/outbox`: provides `outboxEventModel` (queried and spied on to inject failures) and `settleOutboxNudges` (awaited so the relay finishes before assertions).
- `@kernel/events`: `onDomainEvent` subscribes to the bus to check relay delivery.
- `returns/events`: supplies the `RETURN_*` event names.
- `returns/services` (`returnService`) and `returns/services/close` (`closeReturn`): the code under test.
- `returns/repository`: `returnRepository` is used to check persisted state after rollbacks.
- `returns/module` and `payments/module`: registered in the checkout modules in `beforeEach`.
- `@modules/inventory`: `inventoryService` is used in `approvedReturn` to reserve stock.
- The users, products, orders, payments and delivery `tests/factories` supply fixture builders: `createUser`, `createProduct`, `countersOf`, `createOrder`, `setWithdrawUntil`, `toOrderItem`, `payByCard`, `carryOrderTo`.

## Notes
- `@infrastructure/adapters/mailer` is mocked, so `enqueueEmail` is a stub.
- Failure-injection tests use `jest.spyOn(outboxEventModel, 'create').mockRejectedValueOnce(...)`. They assert rollback, including that restocking shares the receipt's transaction.
- `customers` is a module-level counter that gives each fixture user a distinct email.
- The `approvedReturn` payment means receipt opens a refund, and the tests expect `return.closed` to follow automatically.
