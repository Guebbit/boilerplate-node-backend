# src/modules/payments/tests/integration/service.test.ts

## Purpose

Integration tests for the payments service that pin its core invariants: intent creation freezes the order's published total (shipping included), confirmation atomically transitions order → paid and payment → succeeded, a decline is retryable, and the `ORDER_CANCELLED` refund listener fires at-most-once. Runs against real MongoDB (`setupTestDb`) with the `fake` payment provider, because the guarantees under test are the conditional writes themselves.

## Key elements

- **`orderFor(price?, quantity?)`** — Fixture helper: creates a user, a product, and a pending order. Most tests start from this.
- **`paidOrder()`** — Fixture helper: builds on `orderFor`, then creates an intent and confirms it with `GOOD_CARD`, returning a fully-paid order.
- **`asReject(result)`** — Narrowing cast to `ResponseReject` so tests can assert on `.status` and `.errors[0].code`.
- **`GOOD_CARD` / `FAKE_DECLINE_CARD`** — Test card numbers; the latter triggers the provider's simulated decline path.
- **`describe('createIntent')`** — Verifies: total is copied from the order (not recomputed), shipping is included, idempotency (one payment row per order), 404 for non-owner, 409 + `PAYMENT_ORDER_NOT_PAYABLE` for non-pending orders.
- **`describe('confirmPayment')`** — Verifies: order → `paid` before payment → `succeeded`, decline returns 409 + `PAYMENT_DECLINED` and leaves the order retryable, 404 for non-owner, 409 + `PAYMENT_NOT_CONFIRMABLE` on double-confirm, and that a second `createIntent` after payment is rejected.
- **`describe('getForOrder')`** — Verifies read-access ownership: caller's payment returns success, stranger's returns 404.
- **`describe('refund on cancel')`** — Verifies that cancelling a paid order flips the payment to `refunded`, and cancelling an unpaid order leaves the intent untouched. Uses `registerModules` in `beforeEach` and `resetDomainEvents` in `afterEach` to wire/clean the event bus.

## Relationships

- **`src/modules/payments/service.ts`** — The unit under test: `createIntent`, `confirmPayment`, `getForOrder`, `refundByOrder`.
- **`src/modules/payments/repository.ts`** — `paymentRepository` used to assert persisted state after each operation.
- **`src/modules/payments/providers/fake.ts`** — Source of `FAKE_DECLINE_CARD`; the provider instance the tests exercise.
- **`src/modules/payments/module.ts`** — Registered in the refund suite; carries the `ORDER_CANCELLED` listener that triggers the refund.
- **`src/modules/orders/index.ts`** — Exports `orderService` and `orderRepository`, used for status reads, status transitions, and `cancelById`.
- **`src/modules/orders/tests/fixtures.ts`** — Provides `createOrder` and `toOrderItem` for building test orders.
- **`src/modules/orders/module.ts`** — Registered in the refund suite so its event emissions reach the registry.
- **`src/kernel/registry.ts`** — `registerModules` wires all module event subscriptions; required for the refund tests to exercise the listener path.
- **`src/kernel/events.ts`** — `resetDomainEvents` clears the bus between refund tests to prevent cross-test bleed.
- **`src/infrastructure/http/response.ts`** — Source of the `ResponseReject` type used by `asReject`.
- **`src/modules/account/module.ts`, `cart/module.ts`, `delivery/module.ts`, `inventory/module.ts`** — Registered alongside the payments module so the full event graph is active during refund tests.

## Notes

- **`registerModules` is mandatory in the refund suite.** The `ORDER_CANCELLED` → refund subscription is wired through the registry at module-registration time. A test that skips it will assert "refund never fires" and *pass for the wrong reason*. This is the same trap as the cart's `USER_DELETED` suite.
- **Ownership failures return 404, not 403.** The convention is "absence, not forbidden" — a stranger's order/payment simply doesn't exist from their perspective.
- **The shipping test compares against `order.toJSON().totalPrice`, not a literal.** This pins the invariant against the *published* number (what OpenAPI and the UI surface), catching the historical bug where the intent summed line items independently and silently dropped shipping cost.
- **Real database, fake provider.** The conditional writes (`updateStatusIfIn`, atomic state transitions) are what make the guarantees hold; mocking the repository would test nothing about those guarantees. The provider is `fake` so tests are deterministic and network-free.
