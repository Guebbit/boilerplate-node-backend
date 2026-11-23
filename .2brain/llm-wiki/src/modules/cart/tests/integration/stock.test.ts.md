---
source: src/modules/cart/tests/integration/stock.test.ts
source_sha256: 710c39fdeb95e54d81a9a906a16619356c483d48f7b12765d0bcb07cb6392faa
context_sha256: 6372f7e1779f514e71be7b62ed791e286581eef36eb86e6dbc98d29a8e0269aa
generated_at: 2026-11-22T04:42:21.597789+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/tests/integration/stock.test.ts

## Purpose
Integration suite for the stock reservation model across the order lifecycle. The invariant under test is that units leave the shop only once paid for. Between checkout and payment they are held (reserved), not sold, and can be recovered by cancel or by the expiry sweep. Every case asserts `onHand` and `reserved` together. It runs against a real Mongo, because the guarantees are conditional writes that a mock cannot show.

## Key elements
- `setupTestDb()`: called at module level to set up the test database.
- `beforeEach`: calls `resetDomainEvents()` and `registerCheckoutModules([paymentsModule])`, so event subscriptions exist.
- `withoutWindow(body)`: runs `body` with `NODE_RESERVATION_TTL_MINUTES` set to `'0'` through `withEnvironmentOverrides`, so any hold it opens is already stale for the sweep. It is scoped per test because the TTL is read lazily on each reserve.
- `describe('checkout holds units without selling them')`: covers these cases:
  - A completed checkout reserves units and leaves `onHand` unchanged (`onHand: 10, reserved: 3, available: 7`).
  - A cart over the available stock is refused with 409 and `CART_INSUFFICIENT_STOCK`. The error details name the line (`productId`, `title`, `requested`, `availability`) but not the quantity left. The cart survives, with `checkoutable: false`.
  - A product whose units are all held by another user is refused.
  - Every short line is reported at once, and healthy lines are omitted.
  - A failed line releases the holds that earlier lines already took.
  - Two concurrent checkouts for the last unit: exactly one succeeds, and the loser gets `availability: 'out_of_stock'`. The refusal comes from the reserve write, not the pre-flight.
- `describe('a checkout that cannot keep its order')`: uses `afterEach(jest.restoreAllMocks)`. Its first visible case checks that no order is written and no order number is burned when the hold is refused. It spies on `orderRepository.create` and `incrementOrderNumberCounter`. The file is cut off partway through this case.

## Relationships
- **`cart/services` (`cartService`)**: the entry point under test, through `addItemById`, `orderConfirm` and `getForBadge`.
- **`cart/repository` (`cartRepository`)**: `setShippingMethod` is used to prepare carts with the `'pickup'` method.
- **`orders` (`orderService`, `orderRepository`)**: `orderRepository` is spied on. `readOrder` and `countOrders` come from the orders test factories. Orders are expected to react to `RESERVATION_EXPIRED`.
- **`inventory` (`inventoryService`, `removeLevel`)**: imported, along with `inventory/tests/factories`, for the stock-level side of the suite.
- **`kernel/events`**: `resetDomainEvents` clears subscriptions between tests.
- **`kernel/outbox`**: `outboxEventModel` and `settleOutboxNudges` are imported for outbox assertions and settling.
- **`payments/module`**: registered in `beforeEach` as a checkout module.
- **`addresses/tests/factories`**: `giveAddress` gives each user an address before checkout.
- **`infrastructure/adapters/logger`**: `logger` is imported.
- **Other helpers**: user and product factories (`createUser`, `createProduct`, `countersOf`) and `@tests/*` helpers for the DB, environment overrides, callers and checkout module registration.

## Notes
- Registering modules in `beforeEach` matters. Without the `orders` subscription to `RESERVATION_EXPIRED`, the sweep would release units but leave orders `pending`, and the expiry cases would assert only half the behaviour.
- Mocks are restored by hand with `jest.restoreAllMocks()`, because `clearMocks` clears call logs but not implementations.
- The hold is taken before the order is written, so a refused reserve leaves no order to roll back.
- The concurrency test sorts the results with `toSorted()` and uses `toEqual`, not `toMatchObject`, on the loser's details. This makes an extra `available` field on a line fail the test.
