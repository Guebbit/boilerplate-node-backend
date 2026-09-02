# src/modules/orders/tests/integration/retention.test.ts

## Purpose

Integration suite proving the two-phase PII-erasure flow for orders: (1) detaching `userId` and stamping `anonymizeAfter` when an account is hard-deleted, and (2) the `anonymizeDueOrders` sweep that scrubs residual PII once the retention window elapses. The tests register **real** module wiring (not a bare service call) so a missing event subscription in `orders/module.ts` would be caught.

## Key elements

- **`describe('orders — detach on account erasure')`** — Four cases covering: `userId` unset + `anonymizeAfter` ≈ 7 days out on hard delete; order document survives (it is the invoice); soft delete leaves the order untouched; another account's orders are unaffected.
- **`describe('orders — anonymizeDueOrders (reap-orders sweep)')`** — Four cases covering: email / shipping `fullName` / `street` / `phone` scrubbed while `city` and `country` are kept; orders with no `shippingAddress` still get email scrubbed; orders whose `anonymizeAfter` is in the future are skipped; a second sweep is a no-op (idempotent).
- **`beforeEach`** — Calls `registerModules([...])` with all seven domain modules so the `USER_DELETED → detachUserId` event path is exercised through real subscriptions.
- **`afterEach`** — Calls `resetDomainEvents()` and restores the `NODE_ORDER_PII_RETENTION_DAYS` env var.
- **`NODE_ORDER_PII_RETENTION_DAYS`** — Set to `'7'` in the detach test to pin the retention window for assertions.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/kernel/registry.ts` | `registerModules` wires all modules into the event bus so cascade subscriptions are live. |
| `src/kernel/events.ts` | `resetDomainEvents` clears the event bus between tests. |
| `src/modules/orders/module.ts` | Imported as `ordersModule` and registered; its `USER_DELETED` subscription is the behaviour under test. |
| `src/modules/orders/service.ts` | `orderService.anonymizeDueOrders()` is the sweep function exercised in the second describe block. |
| `src/modules/orders/repository.ts` | `orderRepository.findById` / `orderRepository.detachUserId` used to assert and seed order state. |
| `src/modules/orders/index.ts` | Re-export source for `orderRepository`. |
| `src/modules/orders/tests/fixtures.ts` | `createOrder`, `toOrderItem` build the order documents. |
| `src/modules/users/index.ts` | Re-export source for `userService` (triggers `remove(user, true/false)`). |
| `src/modules/users/module.ts` | Registered so the `USER_DELETED` event is emitted. |
| `src/modules/users/tests/fixtures.ts` | `createUser` builds test accounts. |
| `src/modules/products/module.ts` / `tests/fixtures.ts` | Registered; `createProduct` supplies order items. |
| `src/modules/inventory/module.ts`, `account/module.ts`, `cart/module.ts`, `delivery/module.ts` | Registered alongside orders/users so cross-module event wiring is complete. |

## Notes

- **Why full module registration?** A comment in the file header calls this out explicitly: a direct `orderService` call would pass even if `orders/module.ts` stopped subscribing to `USER_DELETED`. The suite intentionally tests the *wiring*, not just the function.
- **Idempotency is structural, not flag-based.** `anonymizeAfter` is *unset* after a scrub, so a second `anonymizeDueOrders()` finds nothing due — there is no "already anonymized" boolean.
- **City/country are deliberately preserved** in the shipping address after scrubbing; the test asserts this to guard against over-scrubbing.
- **`@tests/setup-test-db`** is invoked at module scope (top-level `setupTestDb()`), outside any `beforeEach`, so the DB is configured once per test file.
