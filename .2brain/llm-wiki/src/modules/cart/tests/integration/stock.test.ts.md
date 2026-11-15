---
source: src/modules/cart/tests/integration/stock.test.ts
sha256: 3c0b24ff4b0ff35186f4fff6e57c493a49523e727443a331ea92e7d224d9f9cb
generated_at: 2026-11-14T19:36:28.539191+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/stock.test.ts

## Purpose

Integration suite that verifies the reservation invariant across the full checkout→payment→cancel/expiry lifecycle: units are *held* (not deducted from `onHand`) between checkout and payment, are recoverable on cancel or TTL expiry, and only leave the shelf once PAID. Runs against a real MongoDB instance so that conditional-write guarantees (the atomic reserve that prevents two checkouts from sharing the last unit) are actually exercised rather than mocked.

## Key elements

- **`withoutWindow(body)`** — helper that wraps a test body with `NODE_RESERVATION_TTL_MINUTES: '0'` via `withEnvironmentOverrides`, forcing every reservation to be stale by the time a sweep reads it. Scoped per-test so other cases keep a normal TTL.
- **`describe('checkout holds units without selling them')`** — core suite asserting the `onHand`/`reserved`/`available` triple after:
  - successful checkout (reserve, no deduction),
  - insufficient-stock refusal (cart survives, error names every short line),
  - all-units-held refusal by another user,
  - multi-line shortage reporting (all short lines listed, healthy line excluded),
  - rollback of earlier holds when a later line fails,
  - concurrent `Promise.all` checkout race on the last unit (exactly one wins; loser gets `out_of_stock`, not `insufficient_stock`).
- **`describe('a checkout that cannot keep its order')`** — verifies that a refused reserve writes no order document and burns no order-number counter (spies on `orderRepository` methods).
- **`beforeEach`** — resets domain events (`resetDomainEvents`) and registers checkout modules (`registerCheckoutModules([paymentsModule])`) so the `RESERVATION_EXPIRED` event subscription on the orders module is active.

## Relationships

- **`src/modules/cart/services/index.ts`** — the primary SUT; the test imports `cartService` and drives the entire checkout flow through it.
- **`src/modules/cart/repository.ts`** — the test imports `cartRepository` to set the shipping method as a checkout prerequisite.
- **`src/modules/inventory/index.ts`** — the test imports `inventoryService` to inspect and manipulate stock counter state.
- **`src/modules/inventory/services/index.ts`** — inventory service layer exercised as part of the reservation logic under test.
- **`src/modules/inventory/services/levels.ts`** — level-related inventory operations that participate in the stock assertions.
- **`src/modules/inventory/tests/factories.ts`** — provides the `removeLevel` test utility.
- **`src/modules/orders/index.ts`** — the test imports `orderService` for order-lifecycle steps after checkout.
- **`src/modules/orders/services/index.ts`** — order service logic (including the `RESERVATION_EXPIRED` handler) is exercised indirectly via the checkout and sweep flows.
- **`src/modules/orders/repository.ts`** — the test imports `orderRepository` and spies on its methods to prove no order is persisted when the reserve is refused.
- **`src/modules/orders/tests/factories.ts`** — provides `readOrder` and `countOrders` helpers for post-checkout assertions.
- **`src/modules/payments/module.ts`** — registered as a checkout module so its event subscriptions (payment confirmation, release-on-fail) are active during the sweep tests.
- **`src/kernel/events.ts`** — `resetDomainEvents` clears the in-memory event bus between tests.
- **`src/kernel/outbox.ts`** — `outboxEventModel` and `settleOutboxNudges` are used to flush or assert outbox entries produced during the flow.
- **`src/modules/addresses/tests/factories.ts`** — `giveAddress` seeds the required shipping/pickup address for each test user.
- **`src/infrastructure/adapters/logger.ts`** — `logger` is imported, likely to capture structured log output or silence noise in test output.

## Notes

- **Real Mongo, not mocks.** The file's header comment states the guarantees under test are conditional writes (atomic `findAndModify`-style reserves) that a mock cannot demonstrate. The suite calls `setupTestDb()` at the top level.
- **TTL is read lazily.** `NODE_RESERVATION_TTL_MINUTES` is read at reserve-time, not at module-load time, which is why `withoutWindow` can override it per-test rather than at import time.
- **Event subscription is a prerequisite.** Without `registerCheckoutModules([paymentsModule])`, the `RESERVATION_EXPIRED` → order-status transition never fires, and expiry cases would assert only half the expected behaviour.
- **`toEqual` vs `toMatchObject` is intentional.** In the concurrent-race refusal assertion, `toEqual` is used on `details` to guarantee no extra `available` field leaks into the API response — a shopper must not see the remaining count.
- **The file is truncated** in the source provided; the full suite likely includes cancel-releases-units and TTL-expiry-sweep cases referenced in the module docstring.
