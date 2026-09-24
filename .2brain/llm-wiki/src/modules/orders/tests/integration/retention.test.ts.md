---
source: src/modules/orders/tests/integration/retention.test.ts
sha256: c85546acd8b78a95cade37dfe23188fd6f1588515af7fc05c5fc18d7a8979502
generated_at: 2026-09-23T19:11:43.796853+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/retention.test.ts

## Purpose

Integration suite that verifies the two halves of order PII retention: (1) the `USER_DELETED` event cascade detaches the order from its account and stamps an `anonymizeAfter` deadline, and (2) the `anonymizeDueOrders` sweep scrubs the remaining PII once that deadline passes. Tests run through real module wiring (`registerModules`) rather than calling service functions directly, so a broken subscription in `orders/module.ts` would cause a failure.

## Key elements

- **`describe('orders — detach on account erasure')`** — Four tests covering: hard-delete unsets `userId` and sets `anonymizeAfter` (~7 days via `NODE_ORDER_PII_RETENTION_DAYS`); the order document itself persists (it is the invoice); soft-delete leaves the order untouched; another account's orders are unaffected.
- **`describe('orders — anonymizeDueOrders (reap-orders sweep)')`** — Four tests covering: PII fields (email, shipping `fullName`/`street`/`phone`) are replaced with anonymized placeholders while non-PII fields (`city`, `country`) are preserved; orders with no `shippingAddress` still get their email scrubbed; orders whose `anonymizeAfter` is in the future are skipped; a second sweep is a no-op (idempotency via `anonymizeAfter` being cleared on first run).
- **`beforeEach` / `afterEach` hooks** — Register the full module set and restore `NODE_ORDER_PII_RETENTION_DAYS`; call `resetDomainEvents()` between tests.

## Relationships

- **`src/kernel/registry.ts`** — `registerModules` wires all domain modules so event subscriptions (notably orders → `USER_DELETED`) are active during the test.
- **`src/kernel/events.ts`** — `resetDomainEvents` clears the in-memory event bus between tests.
- **`src/modules/orders/module.ts`** — The module under test; its subscription to `USER_DELETED` is what triggers `detachUserId`. The suite is designed to fail if this subscription is removed.
- **`src/modules/orders/repository.ts`** — `orderRepository.findById` (assertions) and `orderRepository.detachUserId` (sweep-setup helper).
- **`src/modules/orders/services/index.ts`** — `orderService.anonymizeDueOrders`, the production sweep function the second suite exercises.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem` build order fixtures.
- **`src/modules/users/index.ts` / `src/modules/users/module.ts` / `src/modules/users/service.ts`** — `userService.remove(user, hardDelete)` is the trigger for the detach cascade; `usersModule` is registered to complete the event chain.
- **`src/modules/users/tests/factories.ts`** (imported, listed as `src/modules/users/index.ts` neighbor group) — `createUser` fixtures.
- **`src/modules/products/tests/factories.ts`** — `createProduct` fixture.
- **`src/modules/products/module.ts`, `src/modules/inventory/module.ts`, `src/modules/account/module.ts`, `src/modules/cart/module.ts`, `src/modules/delivery/module.ts`** — Registered alongside the orders module so the full event-subscription graph is present; they are not directly asserted but are part of the wiring the suite depends on.

## Notes

- The retention window is controlled by the environment variable `NODE_ORDER_PII_RETENTION_DAYS`; the test sets it to `'7'` and asserts a ±0.1-day tolerance.
- `anonymizeAfter` is **unset** after a successful sweep, which is what makes the sweep idempotent—there is no separate "already scrubbed" flag.
- The suite intentionally does **not** test the `scripts/ops/reap-orders.ts` cron job itself; it only verifies the service method that script calls.
- City and country in the shipping address are deliberately **not** anonymized (documented as non-PII); only `fullName`, `street`, `phone`, and the order-level `email` are scrubbed.
