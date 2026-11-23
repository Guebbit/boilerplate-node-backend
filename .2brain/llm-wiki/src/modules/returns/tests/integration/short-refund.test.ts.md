---
source: src/modules/returns/tests/integration/short-refund.test.ts
source_sha256: a6a9f6a00955f7494800025f8cfa3a741da21ecd0974517b80fa6ffef6347816
context_sha256: 3d17d5306637822d2a86e6db517a63783cee4aaaf473f6d427e66f55f198eef6
generated_at: 2026-11-22T07:37:50.347239+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/tests/integration/short-refund.test.ts

## Purpose
Integration test, run against a real test database and the real `fake` payment provider, for returns whose payment cannot cover the full refund because part of it already went back another way (goodwill refund) or because no payment exists. It pins that a receipt opening no refund leaves the return `received` with no "refunded" mail and no `return.closed` event, and writes exactly one `payment.return_refund_short` outbox fact. A partially covered refund still closes the return, and a hand close emits only an internal event.

## Key elements
- `mockEnqueueEmail`: Jest mock of `enqueueEmail` from the mailer adapter; tests assert which mails were enqueued.
- `paidAndDelivered(pay = true)`: builds a fixture with a unique user, two 30.00 shirts (60.00 total), inventory reserved, optionally paid by card (`pm_card_visa`), and carried to `delivered`.
- `goodwill(orderId, amount)`: admin refund of part of the order's payment, made before the return.
- `withdrawal(fixture)`: creates a `withdrawal` return on the whole order (born approved), settles outbox nudges, and returns its id.
- `shortFacts()`: payloads of all `payment.return_refund_short` outbox rows.
- `refundedMails()`: the mock calls using the `returns.notice` template.
- Test groups:
  - **Payment has nothing left:**
    - A full goodwill refund leaves the return `received` (figure `60.00` kept), sends no mail, writes no `return.closed`, and writes one fact with `opened: '0.00'`, `cause: 'used_up'`.
    - An order with no payment writes a fact with `cause: 'no_payment'`.
    - `closeReturnByHand` closes the return and writes `return.closed_by_hand` with `{ returnId, orderId }`, but no `return.closed` and no mail.
  - **Payment has part left:**
    - With 20.00 goodwill, the return closes, keeps `refundAmount` `60.00`, and the fact shows `opened: '40.00'`, `cause: 'used_up'`.
    - With no goodwill, the return closes and no fact is written.
  - **Proof of sending:** with nothing left, `recordProofOfSending` writes the short fact. A later `receiveReturn` leaves the return `received`, writes no `return.closed`, and does not write a second fact.

## Relationships
- `src/modules/payments/index.ts` (`paymentService`), `src/modules/payments/services/index.ts` and `src/modules/payments/tests/factories.ts` (`refundOrderPayment`): create and confirm the payment intent and issue the goodwill refund.
- `src/modules/returns/module.ts` and `src/modules/payments/module.ts`: registered together via `registerCheckoutModules`.
- `src/modules/returns/services/index.ts` (`returnService`): the code under test (`createReturn`, `receiveReturn`, `closeReturnByHand`, `recordProofOfSending`).
- `src/modules/returns/repository.ts` (`returnRepository`): `findById` confirms the stored status.
- `src/kernel/outbox.ts`: `outboxEventModel` is queried for emitted facts, and `settleOutboxNudges` flushes them.
- `src/kernel/events.ts`: `resetDomainEvents` runs after each test.
- `src/infrastructure/adapters/mailer.ts`: mocked, with `enqueueEmail` asserted on.
- `src/modules/inventory/index.ts` (`inventoryService`): reserves stock for the order fixture.
- `src/modules/orders/tests/factories.ts`, `src/modules/products/tests/factories.ts` and `src/modules/delivery/tests/factories.ts` (`createOrder`, `createProduct`, `carryOrderTo`): build the fixtures.

## Notes
- The mailer is mocked with `jest.mock`; the DB and payment provider are not.
- The "refunded" mail is identified by the `returns.notice` template.
- `customers` is a module-level counter that gives each fixture a distinct email.
- `afterEach` calls both `resetDomainEvents` and `jest.restoreAllMocks`.
