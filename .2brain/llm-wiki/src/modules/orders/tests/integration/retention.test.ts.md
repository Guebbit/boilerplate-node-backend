---
source: src/modules/orders/tests/integration/retention.test.ts
sha256: d9b09ce6081dcf00efb9f034536c747bf183c3c3d3c9a7000ee312d345127f21
generated_at: 2026-09-27T15:19:08.562750+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/retention.test.ts

## Purpose

Integration tests for the two-phase PII erasure flow: (1) the `USER_DELETED` event cascade that detaches an order from a hard-deleted account and schedules anonymization, and (2) the `anonymizeDueOrders` sweep that scrubs residual PII once the retention window elapses. The tests exercise real module wiring (event subscriptions) rather than calling service functions directly, so they fail if `orders/module.ts` stops listening for the erasure event.

## Key elements

- **`describe('orders — detach on account erasure')`** — Six tests verifying that a hard delete via `userService.remove(user, true)` unsets `order.userId`, sets `anonymizeAfter` to `max(now, createdAt + NODE_ORDER_PII_RETENTION_DAYS)`, leaves the order document itself intact, does nothing on soft delete, and never touches another user's orders.
- **`describe('orders — anonymizeDueOrders (reap-orders sweep')`** — Four tests verifying that `orderService.anonymizeDueOrders()` scrubs `email`, `shippingAddress.fullName`, `shippingAddress.street`, `shippingAddress.phone`, and `notes` once `anonymizeAfter` has elapsed; preserves `city`/`country`; handles orders with no shipping address; skips orders not yet due; and is idempotent (second call returns 0).
- **`detachOrderUserId` (from factories)** — Test helper that manually sets `userId: undefined` and `anonymizeAfter` on an existing order, bypassing the event path so the sweep tests can focus on the scrub logic.

## Relationships

- **`src/kernel/events.ts`** — `resetDomainEvents()` in `afterEach` clears the in-memory event bus so subscriptions registered by one test don't leak into the next.
- **`tests/support/checkout-modules.ts`** — `registerCheckoutModules()` in `beforeEach` wires all module event subscriptions (including `USER_DELETED → detachUserId`) so the cascade tests exercise the real pub/sub path.
- **`src/modules/users/index.ts` / `src/modules/users/service.ts`** — `userService.remove(user, hardDelete)` is the trigger under test; the second boolean argument distinguishes hard vs. soft delete.
- **`src/modules/orders/services/index.ts`** — `orderService.anonymizeDueOrders()` is the sweep function tested in the second suite.
- **`src/modules/orders/repository.ts`** — `orderRepository.findById` is used throughout to assert post-conditions on the persisted document.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem`, `detachOrderUserId` provide test fixtures and a manual detach helper.
- **`src/modules/users/tests/factories.ts`** — `createUser` builds the account being erased.
- **`src/modules/products/tests/factories.ts`** — `createProduct` supplies a valid product for order line items.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the in-memory/test database before the suite runs.

## Notes

- **B17 (retention clock):** `anonymizeAfter` is computed as `max(now, order.createdAt + retentionDays)`, so an order already past its window is due *immediately* rather than getting a fresh window from the erasure moment. Two dedicated tests pin this.
- **Real-wiring requirement:** The module docblock and `registerCheckoutModules()` call make it explicit that a direct call to `detachUserId` would pass even if the subscription were removed; these tests are the guard against that regression.
- **Env var hygiene:** `NODE_ORDER_PII_RETENTION_DAYS` is saved/restored in `afterEach`; tests that don't set it (the "order survives" and "soft delete" cases) rely on the default.
- **Anonymization scope:** `city` and `country` are deliberately preserved (not PII on their own); `fullName`, `street`, `phone`, `notes`, and `email` are all scrubbed. `email` is replaced with the literal `'anonymized@deleted.invalid'` rather than deleted.
