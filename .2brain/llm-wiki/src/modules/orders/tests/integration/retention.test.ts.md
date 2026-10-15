---
source: src/modules/orders/tests/integration/retention.test.ts
sha256: 5c582036581c6919d516a4e9bef879d7ced7051fdfa7dd8679f7d842b9382c1b
generated_at: 2026-10-15T11:16:55.269842+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/retention.test.ts

## Purpose

Integration tests for the order PII-retention lifecycle: (1) the detach cascade that fires when a user account is hard-deleted (unsetting `userId` and scheduling `anonymizeAfter`), and (2) the `anonymizeDueOrders` sweep that scrubs the remaining PII once the retention window elapses. The tests exercise the full `personalData.erase → detachUserId` hook through real module wiring rather than calling the service function directly, so they would fail if `orders/module.ts` ever stopped declaring the hook.

## Key elements

- **`describe('orders — detach on account erasure')`** — Verifies that `userService.remove(user, true)` unsets `userId`, sets `anonymizeAfter` to `max(now, createdAt + RETENTION_DAYS)`, leaves the order document intact, ignores soft-deletes, and does not touch a different user's orders.
- **`describe('… never-paid order … (A1)')`** — Pins the rule that an order which was never paid (`paidAt` undefined) is due for anonymization immediately regardless of how old it is, while a paid-then-cancelled order still gets the full window.
- **`describe('… anonymizeDueOrders (reap-orders sweep)')`** — Exercises `orderService.anonymizeDueOrders()` to confirm it blanks email to a sentinel, unsets `shippingAddress`, `billingAddress`, and `notes`, clears `anonymizeAfter`, and bumps the optimistic-lock version.
- **`beforeEach: registerCheckoutModules()`** — Wires the real module graph so the `personalData.erase` event reaches the order hook.
- **`afterEach: resetDomainEvents()`** — Clears the event bus between tests.
- **`setEnvironment({ NODE_ORDER_PII_RETENTION_DAYS })`** — Controls the retention window per-test without needing a config file.

## Relationships

- **`src/modules/users/index.ts` / `src/modules/users/services/index.ts`** — `userService.remove(user, hardDelete)` is the trigger that starts the cascade.
- **`src/modules/orders/services/index.ts`** — `orderService.anonymizeDueOrders()` is the sweep function under test.
- **`src/modules/orders/repository.ts`** — `orderRepository.findById` is used to assert persisted state after each operation.
- **`src/modules/orders/tests/factories.ts`** — Provides `createOrder`, `toOrderItem`, `detachOrderUserId`, and `markOrderPaidAt` helpers.
- **`src/modules/users/tests/factories.ts`** — `createUser` factory.
- **`src/modules/products/tests/factories.ts`** — `createProduct` factory.
- **`src/infrastructure/persistence/versioning.ts`** — `versionOf` reads the optimistic-lock counter to assert the sweep bumped it.
- **`src/kernel/events.ts`** — `resetDomainEvents` isolates the event bus between tests.
- **`src/types/index.ts`** — `OrderStatus` enum for paid/cancelled variants.
- **`tests/support/checkout-modules.ts`** — `registerCheckoutModules` registers the module graph for integration-level wiring.
- **`tests/support/environment.ts`** — `setEnvironment` injects `NODE_ORDER_PII_RETENTION_DAYS`.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` initialises the test database.

## Notes

- The retention arithmetic is `max(now, createdAt + days)`, **not** `now + days`. The "runs the clock from the ORDER, not from today" test guards against a regression that would re-anchor the deadline at erasure time.
- The deciding field for "immediate vs. window" is `paidAt` (set via `markOrderPaidAt`), **not** the current `status`. A cancelled order that was once paid still gets the full window.
- The version-bump test at the end of the sweep block ensures that any edit form opened before the sweep is rejected afterwards (optimistic-lock guard against post-scrub mutations).
- The tests rely on `registerCheckoutModules` to wire the hook through the real module graph; a bare call to the service function would bypass the hook declaration and would not catch a missing registration.
