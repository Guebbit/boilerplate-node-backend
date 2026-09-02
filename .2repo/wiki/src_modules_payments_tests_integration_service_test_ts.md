# src/modules/payments/tests/integration/service.test.ts

## Purpose

Integration tests for the payments service (`src/modules/payments/service.ts`) that pin its core invariants against a real MongoDB: the intent freezes the order's published total (shipping included), confirmation conditionally moves the order `pending → paid` before the payment row becomes `succeeded`, a decline is retryable, and the `ORDER_CANCELLED` refund path is at-most-once. Real Mongo is used throughout because the guarantees under test *are* the conditional writes; the payment provider is the in-process `fake` implementation.

## Key elements

- **`GOOD_CARD` / `FAKE_DECLINE_CARD`** – card numbers from `@modules/payments/providers/fake` used to drive success and decline paths.
- **`asReject(result)`** – type-narrowing helper that casts a service result to `ResponseReject` so tests can assert on `status` and `errors[0].code`.
- **`orderFor(price?, quantity?)`** – fixture builder: creates a user, a product, and a pending order; returns the trio for use as test setup.
- **`auth(user)`** – builds the minimal caller-context object (`{ id, admin: false }`) passed to service calls.
- **`paidOrder()`** – end-to-end fixture: calls `createIntent` then `confirmPayment` with a good card, returning the now-paid user/order pair.
- **`describe('createIntent')`** – five tests covering: total freeze (arithmetic), shipping-inclusion (compared against `order.toJSON().totalPrice`), idempotency (one payment row per order), 404 for a stranger's order, and 409 with `PAYMENT_ORDER_NOT_PAYABLE` for a non-pending order.
- **`describe('confirmPayment')`** – six tests covering: happy-path order→paid + payment→succeeded ordering, decline→409 `PAYMENT_DECLINED` with retry, 404 for a stranger, double-confirm 409 `PAYMENT_NOT_CONFIRMABLE`, re-intent-after-paid 409, and the race-window refund (order cancelled between intent and confirm triggers an immediate provider refund and leaves the row at `requires_confirmation`).
- **`describe('getForOrder')`** – single test verifying ownership: caller sees their payment, a stranger gets 404.
- **Refund-on-cancel block** (truncated in the snippet) – exercises the `ORDER_CANCELLED` event listener registered via the module registry; requires `registerModules` to have run before the subscription exists.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/payments/service.ts` | The system under test: `createIntent`, `confirmPayment`, `getForOrder`, `refundByOrder` are all exercised here. |
| `src/modules/payments/repository.ts` | `paymentRepository.findByOrderId` and `.count` are used to assert persisted state. |
| `src/modules/payments/providers/fake.ts` | `fakePaymentProvider` is the active provider; `FAKE_DECLINE_CARD` drives the decline path; `refund` is spied on in the race-window test. |
| `src/modules/payments/module.ts` | Registered via `registerModules` so the `ORDER_CANCELLED` listener is subscribed. |
| `src/modules/orders/index.ts` | Exports `orderService` and `orderRepository` used to read order status and force a status change (`updateStatusIfIn`). |
| `src/modules/orders/service.ts` | `orderService.getById` (status assertions), `orderService.cancelById` (race-window test). |
| `src/modules/orders/repository.ts` | `orderRepository.updateStatusIfIn` to simulate a non-pending order. |
| `src/modules/orders/tests/fixtures.ts` | `createOrder` and `toOrderItem` build the order fixture. |
| `src/kernel/registry.ts` | `registerModules` wires all modules so event subscriptions exist before tests run. |
| `src/kernel/events.ts` | `resetDomainEvents` clears the in-memory event bus between tests. |
| `src/modules/inventory/module.ts`, `src/modules/account/module.ts`, `src/modules/cart/module.ts`, `src/modules/delivery/module.ts` | Registered alongside payments/orders so cross-module event listeners and repository wiring are present. |
| `src/infrastructure/http/response.ts` | Provides the `ResponseReject` type used by the `asReject` helper. |

## Notes

- **Real Mongo, fake provider.** The test suite relies on actual conditional writes (e.g., `updateOne` with a status guard) to validate the "payment row only says `succeeded` when the order does" invariant. Mocking the database would defeat the purpose.
- **Shipping test pins against `totalPrice`, not a literal.** The test asserts `payment.amount === order.toJSON().totalPrice` rather than hard-coding `115`, deliberately guarding against the two-files-computing-different-numbers class of bug the docblock describes.
- **Ownership is 404, not 403.** The convention throughout is: if the caller isn't the owner, the resource is treated as *absent* (404), never as *forbidden* (403).
- **The refund-on-cancel test spies on the fake provider.** It uses `jest.spyOn(fakePaymentProvider, 'refund')` to assert the refund was issued exactly once with the intent's amount/currency, then restores the mock.
- **`registerModules` must run before the refund listener tests.** The `ORDER_CANCELLED` subscription only exists after the registry has executed; skipping it would silently skip the listener.
- **`asReject` is a cast, not a guard.** It assumes the result is a rejection; if the service unexpectedly succeeds, the cast is unsound and the assertion will throw on `status` being `undefined` rather than failing with a clear message.
