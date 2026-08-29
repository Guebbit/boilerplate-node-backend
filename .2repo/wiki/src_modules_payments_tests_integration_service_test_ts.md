# src/modules/payments/tests/integration/service.test.ts

## Purpose

Integration tests for the payments service (`createIntent`, `confirmPayment`, `getForOrder`, `refundByOrder`) run against a real Mongo instance. They pin the two ordering invariants (order total → intent amount; order `pending→paid` before payment `→succeeded`) and the four guards: idempotent intent, no double-confirm, decline-is-retryable, and at-most-once refund. The provider is the in-repo `fake` one, whose magic cards define the contract.

## Key elements

- **`orderFor(price?, quantity?)`** — Fixture: creates a user, a product, and a single-line order via the orders test factory.
- **`paidOrder()`** — Fixture: builds on `orderFor`, then calls `createIntent` + `confirmPayment` with `GOOD_CARD`; returns a fully paid order.
- **`GOOD_CARD`** (`'4242 4242 4242 4242'`) — Card number the fake provider recognises as a success.
- **`FAKE_DECLINE_CARD`** (imported from `@modules/payments/providers/fake`) — Card number that triggers a decline path.
- **`asReject(result)`** — Cast helper so tests can assert on `ResponseReject.status` / `.errors[].code` without a runtime check.
- **`describe('createIntent')`** — Verifies: amount equals `order.totalPrice` (shipping included); idempotency (second call returns the same row, `count` stays 1); 404 for a non-owner; 409 + `PAYMENT_ORDER_NOT_PAYABLE` for a non-pending order.
- **`describe('confirmPayment')`** — Verifies: order becomes `paid` and payment `succeeded` with `cardLast4`; decline returns 409 + `PAYMENT_DECLINED`, order stays `pending`, and the *same* document can be re-confirmed; 404 for non-owner; 409 + `PAYMENT_NOT_CONFIRMABLE` on second confirm; 409 on a new intent after money moved.
- **`describe('getForOrder')`** — Caller sees own payment; a stranger receives 404.
- **`describe('refund on cancel')`** — Registers all modules in `beforeEach`, resets domain events in `afterEach`. Verifies: `orderService.cancelById` on a paid order flips payment to `refunded`; cancelling a never-paid order leaves no refund row.

## Relationships

- **`@modules/payments/service`** — System under test; all four exported functions are exercised.
- **`@modules/payments/repository`** — `paymentRepository.findByOrderId` / `.count` used for post-state assertions.
- **`@modules/payments/providers/fake`** — Supplies `FAKE_DECLINE_CARD`; the provider itself acts as the test double for card authorisation.
- **`@modules/payments/module`** — Registered in the refund suite so its `ORDER_CANCELLED` listener is active.
- **`@modules/orders/service`** — `orderService.getById` (state checks) and `orderService.cancelById` (triggers the refund event).
- **`@modules/orders/repository`** — `orderRepository.updateStatusIfIn` to simulate a `shipped` order for the 409 guard test.
- **`@modules/orders/tests/factory`** — `createOrder`, `toOrderItem` build the order fixtures.
- **`@kernel/registry`** — `registerModules` wires event subscriptions; required for the refund-on-cancel suite.
- **`@kernel/events`** — `resetDomainEvents` tears down listener subscriptions after each refund test.
- **`@infrastructure/http/response`** — `ResponseReject` type used by `asReject` for typed error assertions.
- **`@modules/account/module`, `@modules/cart/module`, `@modules/delivery/module`, `@modules/inventory/module`** — Registered alongside `paymentsModule` in the refund suite so the full module graph is present.

## Notes

- Tests run against **real Mongo** (`setupTestDb`), not in-memory stubs, because the guarantees under test are the *conditional writes* (compare-and-swap on order status, compare-and-swap on payment status).
- The refund-on-cancel suite **must** call `registerModules` in `beforeEach`; without it the `ORDER_CANCELLED` listener never fires and a test asserting "no refund for never-paid" would pass for the wrong reason (no listener, not a correct at-most-once guard).
- The fake provider is used *as the contract*, not as a simplification: `GOOD_CARD` and `FAKE_DECLINE_CARD` are the only two card numbers that matter, so the tests exercise both real paths (success and decline) without a network mock.
- `testCallerContext` (from `@tests/caller-context`) is passed as the fourth argument to `confirmPayment`; it satisfies the service's requirement for a caller envelope without constructing one inline.
