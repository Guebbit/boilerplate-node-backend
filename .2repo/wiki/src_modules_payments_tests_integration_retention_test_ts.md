# src/modules/payments/tests/integration/retention.test.ts

## Purpose

Integration tests verifying the **erasure retention contract** for payments: when a user account is hard-deleted, the associated payment is *detached* (its `userId` is unset) rather than deleted, preserving the record as a receipt. Also pins that the one live path that can still hit a detached order — an admin `createIntent` — records no payer (`undefined`) instead of the literal string `"undefined"`. Tests run against real module wiring (no service-level mocks) to prove the cascade works end-to-end.

## Key elements

- **`describe('payments — detach on account erasure')`** — the sole suite; three test cases:
  - *unsets userId on the payment when the account is hard-deleted* — creates user → order → payment via `createIntent`, then calls `userService.remove(user, true)` and asserts `paymentRepository.findById(...)` returns a doc with `userId === undefined`.
  - *the payment itself survives* — same setup, asserts the payment document is still retrievable after account deletion.
  - *admin intent against a detached order records no payer* — pre-detaches via `orderRepository.detachUserId(...)`, fires `createIntent` with `{ admin: true }`, asserts `payment.userId` is `undefined` (not the string `"undefined"`).
- **`beforeEach`** — registers all eight domain modules (`account`, `delivery`, `products`, `users`, `inventory`, `orders`, `payments`, `cart`) via `registerModules`.
- **`afterEach`** — calls `resetDomainEvents()` to clear the kernel event bus between tests.
- **`setupTestDb()`** — top-level call that prepares the in-memory test database before any test runs.

## Relationships

- **`@modules/payments/service.ts`** — `createIntent` is the primary system under test; called in all three cases.
- **`@modules/payments/repository.ts`** — `paymentRepository.findById` is the assertion vehicle for verifying `userId` state and record survival.
- **`@modules/payments/module.ts`** — registered in `beforeEach`; provides the event/listener wiring that makes the `USER_DELETED` → `detachUserId` cascade fire.
- **`@modules/orders/repository.ts`** (via `@modules/orders/index.ts`) — `orderRepository.detachUserId` is used directly in the third test to simulate a pre-detached state.
- **`@modules/orders/module.ts`** — registered so the order-side cascade subscriber is active.
- **`@modules/orders/tests/fixtures.ts`** — `createOrder` and `toOrderItem` build the order + line-item fixture.
- **`@kernel/registry.ts`** — `registerModules` wires all modules into the shared dependency container for the test.
- **`@kernel/events.ts`** — `resetDomainEvents` prevents event-leak between tests.
- **`@infrastructure/http/response.ts`** — `ResponseSuccess<PaymentDocument>` type used to narrow the `createIntent` return value.
- **`@modules/payments/model.ts`** — `PaymentDocument` type for the same cast.
- **`@modules/account/module.ts`, `@modules/cart/module.ts`, `@modules/delivery/module.ts`, `@modules/inventory/module.ts`** — registered for completeness of the module graph; not directly exercised by assertions but required so the registry resolves all inter-module event subscriptions.

## Notes

- Tests deliberately use **real module wiring** (no `vi.mock` on the payment or order services) to validate the cascade path `USER_DELETED → detachUserId` through actual event emission and subscription, matching the style of the cart cascade suite.
- The third test bypasses `userService.remove` entirely, calling `orderRepository.detachUserId` directly with a **future timestamp** (`Date.now() + 100_000`). This exercises only the "already-detached" branch of `createIntent` without depending on the event cascade.
- The file header comment explicitly frames this as the *one live path* that can still reach a detached order (admin intent), distinguishing it from the cascade case which is already covered by the account-erasure event flow.
- The assertion `toBeUndefined()` (not `toBeNull()` or `toBe('undefined')`) is intentional: it guards against a serialization bug where a missing field is stringified.
