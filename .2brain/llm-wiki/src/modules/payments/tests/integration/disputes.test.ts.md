---
source: src/modules/payments/tests/integration/disputes.test.ts
source_sha256: 83350b9e41838a7a65f9aa8e4828456b96c32e746ba5f17d8310b6cc42890388
context_sha256: e27c739095bbdb7adf5b7a94ac39cdb78f94d567a14825733be4dfb65fec8208
generated_at: 2026-11-22T06:56:34.947635+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/integration/disputes.test.ts

## Purpose
Integration test suite for the payments module's handling of card-payment disputes (chargebacks and inquiries) reported by the provider. It checks that a delivered dispute report is stored on the payment, ordered by the provider's own `observedAt`, announced via outbox events, written to the order's staff timeline, and surfaced to staff. It also checks that disputes affect refund eligibility without being treated as refunds. It runs against real Mongo and the fake provider's dispute lever, going through the services' public API.

## Key elements
- **`paidOrder()`**: creates a unique buyer, a 50.00 product (2 units, so 100.00) and an order. It pays by card, settles outbox nudges, and returns `{ orderId, providerRef }`.
- **`report(over)`**: builds a `ProviderDisputeState` for `dp_1`. Defaults are chargeback, `needs_response`, `fraudulent`, 100.00 EUR, funds withdrawn, evidence due in 7 days, `observedAt` at the start. Fields can be overridden.
- **`deliverReport(providerRef, over)`**: sends a report through `deliver(setFakeDispute(...))`, the same path the webhook route uses.
- **`when` / `at` / `START`**: a deterministic clock. `when(minutes)` gives a `Date` and `at(minutes)` an ISO string, that many minutes after 2026-10-01T10:00Z.
- **`staffView(orderId)`**: reads `paymentService.getForOrder` as admin.
- **`events(name)`**: counts outbox rows for an event name.
- **`refund(orderId, amount?)`**: calls `refundOrderPayment` as an admin operator.
- **`describe('a dispute is reported')`** covers:
  - storing the dispute, announcing it once, adding a timeline row, and leaving the order untouched;
  - visibility to staff only, not to the payer;
  - dropping reports older than the stored one and ignoring repeats;
  - newer reports applying as updates, with the timeline closing once;
  - a closed dispute flipping to won, or reopening and clearing `closedAt`;
  - dropping reports for an unknown intent or the wrong provider;
  - storing a report in a different currency than the payment.
- **`describe('the refund door while a dispute stands')`** covers:
  - an open chargeback giving 409 `PAYMENT_DISPUTED` and greying out `actions.refund`;
  - refunds staying allowed during an inquiry;
  - a lost chargeback reducing the refundable amount, where asking for more than the remainder is a 422.
  
  The visible portion of this block ends partway through the last case.

## Relationships
- **`@modules/payments/services` (`paymentService`)**: the public door under test (`getForOrder`).
- **`@modules/payments/providers/registry`**: `registerPaymentProvider` registers a second provider named `some-other-provider`, to test cross-provider rejection.
- **`@scenarios/support/doubles/payments/fake`**: supplies `fakePaymentProvider` and `setFakeDispute`, which stages the dispute for the next delivery.
- **`@modules/payments/repository`**: `paymentRepository` is used to fetch `providerRef`, `userId` and `refunds`.
- **`@modules/payments/events`**: the event name constants `PAYMENT_DISPUTE_OPENED`, `PAYMENT_DISPUTE_UPDATED`, `PAYMENT_REFUNDED` and `PAYMENT_REFUND_OWED_AFTER_DISPUTE`. The last is imported, but not used in the visible portion.
- **`@kernel/outbox`**: `outboxEventModel` and `settleOutboxNudges` for counting and flushing events.
- **`@kernel/events`**: `resetDomainEvents` runs in `afterEach`.
- **`@modules/orders`** and **`@modules/orders/tests/factories`**: `orderService` checks the order is unchanged. `createOrder`, `toOrderItem` and `timelineOf` build orders and read the staff timeline.
- **`@modules/payments/module`**: registered through `registerCheckoutModules([paymentsModule])`.
- **`@modules/payments/model`** (`paymentModel`) and **`@modules/payments/providers`** (`ProviderDisputeState` type): imported. `ProviderDisputeState` types `report`; `paymentModel` is not used in the visible portion.

## Notes
- `payByCard`, `refundOrderPayment`, `deliver`, and the `@tests/*` helpers (`setupTestDb`, `asAdmin`, `asCustomer`, `callerContextAs`, `asReject`) come from shared test utilities.
- A dispute is deliberately not a refund. The tests assert no `payment.refunded` event, no order status change, and `displayStatus` stays `'succeeded'`.
- Disputes are visible to staff only. A payer's view has `disputes` undefined.
- A dispute in a currency other than the payment's is stored and announced. A lost chargeback in a different currency does not reduce the refundable amount.
- `buyers` is a module-level counter that keeps each test's email unique.
