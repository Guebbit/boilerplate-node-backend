---
source: src/modules/orders/tests/unit/notify.test.ts
source_sha256: c6c099d10d8b041a04d20025fc62c06a857a14091177186c9b1ac5cd2ce217ac
context_sha256: 554720cba4a08bc6abd6860753ffe5976edc69573927887e25f8e1ad9a604b4c
generated_at: 2026-11-22T06:36:50.461341+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/unit/notify.test.ts

## Purpose
Unit tests for `mailBuyer` (`src/modules/orders/services/notify.ts`), the policy that governs every customer mail about an order. It covers two policy branches: skipping anonymised orders and falling back when the buyer lookup fails. The mails themselves are tested in listener tests beside the flows that send them.

## Key elements
- `enqueueEmailMock`: a `jest.fn()` resolving to `undefined`. It replaces `enqueueEmail` from `@infrastructure/adapters/mailer` via `jest.mock`, so tests can check which mail was enqueued.
- `orderFixture(overrides)`: builds a stub `OrderDocument` with `asStub`. By default it is a one-item EUR card order with id `order-1`.
- `beforeEach`: clears all mocks and re-arms `enqueueEmailMock` to resolve.
- `describe('mailBuyer — anonymised order')`:
  - An order with `ANONYMIZED_EMAIL` sends nothing: the `build` callback is not called and nothing is enqueued.
  - An order with a real email still calls `build(expect.any(String), 'ada@example.com')`.
- `describe('mailBuyer — buyer lookup fails')`: the `getById` method of the imported `userService` rejects once. `build` is called with the order email as the name, and the logger's `error` method is called with `{ message: 'Buyer lookup failed; mailing the order with the fallback name.', orderId: 'order-1', error }`.

## Relationships
- `src/modules/orders/services/notify.ts`: the unit under test (`mailBuyer`).
- `src/modules/orders/domain/anonymization.ts`: supplies `ANONYMIZED_EMAIL`, the sentinel that triggers the no-send path.
- `src/modules/orders/model.ts`: supplies the `OrderDocument` type for the fixture.
- `src/modules/users/index.ts` (`@modules/users`): exports `userService`, whose `getById` is spied on to simulate a failed lookup. `src/modules/users/services/index.ts` is a neighbor but is not imported directly here.
- `src/infrastructure/adapters/logger.ts`: exports `logger`, whose `error` method is spied on and mocked to verify the failure log.
- `tests/support/stub.ts` (`@tests/stub`): provides `asStub` for the partial order fixture.

## Notes
- The first test title says it never looks the buyer up, but it only asserts `build` and `enqueueEmailMock` were not called. The lookup is not asserted.
- The mailer is module-mocked, but the real `mailBuyer` is used with a `jest.fn()` `build` callback.
- The `logger` and `userService` spies are not restored here. They rely on `jest.clearAllMocks()` in `beforeEach`, which clears call history but does not restore the original implementations.
