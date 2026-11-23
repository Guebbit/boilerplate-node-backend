---
source: src/modules/returns/tests/integration/proof-of-sending.test.ts
source_sha256: 1af3463ab0aa25613e13b6182200f7307d74b6ae514c658c07968953e090d80e
context_sha256: dd3453ed715b9038b79c41f1a100d38b84f79c7357b543fcd14da90294fe5632
generated_at: 2026-11-22T07:35:29.698836+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/tests/integration/proof-of-sending.test.ts

## Purpose
Integration test suite for the buyer's proof of sending on a return. It runs against a real test database and the real `fake` payment provider. It checks that on a withdrawal the proof opens the refund immediately and only once. On a faulty (`defective`) item the proof is only recorded. When the goods arrive afterwards, no second refund is opened, and a handling deduction is not allowed on a refund already opened.

## Key elements
- `setupTestDb()`, plus a `beforeEach` that registers `paymentsModule` and `returnsModule` via `registerCheckoutModules`. `afterEach` calls `resetDomainEvents()` and `jest.restoreAllMocks()`.
- `proofOn(sentAt)`: builds the carrier document (`Poste Italiane`, reference `RR123456789IT`).
- `approvedReturn(reason)`: fixture helper.
  - Creates a user with a unique email and a 30.00 shirt, then an order of 2 shirts.
  - Reserves inventory, creates and confirms a payment intent with `pm_card_visa`, and carries the order to `delivered`.
  - Creates the return. A `withdrawal` return is left as created, while `defective` is approved by an admin.
  - Returns `{ shirt, orderId, returnId }`.
- `describe('a proof of sending on a withdrawal')` covers:
  - The refund opens with `dueRule: 'withdrawal'` and `dueBy` from `withdrawalRefundDueBy(requestedAt, shopTimezone())`. `refundAmount` is `'60.00'`.
  - The proof fields are stored (`proofOfSendingAt`, `proofCarrier`, `proofReference`), and one `proof_of_sending_recorded` timeline row carries `{ returnId }`.
  - A second call answers 409 `RETURN_PROOF_ALREADY_RECORDED` and opens no second refund.
  - `withActions` turns `recordProof` off once a proof exists. It turns `cancel` off only for the withdrawal, not the faulty return.
  - A return that was already received is refused with `RETURN_NOT_RECEIVABLE`.
  - When `requestedAt` is 40 days back, `dueBy` equals the proof's `sentAt` (the date on the proof) instead of the 14-day date.
  - A future `sentAt` gives 422 `RETURN_PROOF_DATE_INVALID` with `details.field` of `sentAt`, and nothing is recorded.
  - Staff canceling after the proof gets 409 `RETURN_REFUND_OPEN`, and the status stays `approved`.
- `describe('the goods arriving after a proof on a withdrawal')` covers:
  - `receiveReturn` restocks (`onHand` back to 10) and closes the return. It opens no second refund.
  - A `handlingDeduction` of `'1.00'` is refused with 409 `RETURN_REFUND_OPENED_ON_PROOF` before anything moves. The status stays `approved` and `onHand` stays 8.
  - A test that sets `NODE_PAYMENT_REFUND_RETRY_MINUTES` to `'0'` via `withEnvironmentOverrides` and makes `fakePaymentProvider.refund` fail once. It is about the return staying received while the refund is still owed, and the sweep closing it when the refund lands. The rest of that test is not shown.

## Relationships
- `returnService`, `returnRepository`, `returnModel` and `returnsModule` (`../../services`, `../../repository`, `../../model`, `../../module`) are the code under test. The tests call `recordProofOfSending`, `receiveReturn`, `cancelReturn`, `createReturn`, `approveReturn` and `withActions`. They also read and update the return model directly.
- `@modules/payments` (`paymentService`, `module`) creates and confirms the payment intent. `storedRefundStamps` from `payments/tests/factories` reads the refund stamps (`returnId`, `dueRule`, `dueBy`) saved on the order.
- `scenarios/support/doubles/payments/fake.ts` provides `fakePaymentProvider`, which one test spies on so that `refund` rejects.
- `@modules/orders` supplies `withdrawalRefundDueBy` (from the withdrawal domain logic). `orders/tests/factories` supplies `createOrder`, `toOrderItem` and `timelineOf`.
- `@modules/inventory` supplies `inventoryService`, used by the fixture to reserve stock for the order. `products/tests/factories` supplies `createProduct` and `countersOf` for the `onHand` assertions.
- `delivery/tests/factories` `carryOrderTo` moves the order to `delivered`.
- `@kernel/events` `resetDomainEvents` clears domain events between tests.

## Notes
- Fixture emails are made unique with a module-level `buyers` counter.
- A `withdrawal` return is not approved by the fixture, but `recordProofOfSending` is still expected to leave it `approved`. A `defective` return is approved explicitly.
- Error assertions use `asReject(result)` to read `status` and `errors[0].code`.
- Timing tests set `requestedAt` directly through `returnModel.updateOne` and use `Date.now()` offsets.
