---
source: src/modules/cart/tests/integration/stock.test.ts
sha256: 446f9883f42af4a087654a1062e03c5a683516ed2756d113b5e6820cd6757209
generated_at: 2026-09-23T18:34:06.123561+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/stock.test.ts

## Purpose

Integration test suite for the reservation-based stock model. Verifies the core invariant that units are _held_ (reserved) between checkout and payment rather than _sold_, and are recoverable by cancellation or expiry sweep. Runs against a real MongoDB instance because the guarantees under test are conditional writes that a mock cannot demonstrate.

## Key elements

- **`countersOf(productId)`** — helper that reads `onHand`, `reserved`, and derived `available` directly from the product document. Every assertion in the file goes through this so both counters are checked together.
- **`withoutWindow(body)`** — wraps a test body with `NODE_RESERVATION_TTL_MINUTES=0` via `withEnvironment`, making any hold immediately stale for expiry-sweep cases. Scoped per-call so other tests keep a normal TTL.
- **`describe('checkout holds units without selling them')`** — happy-path reservation, insufficient-stock refusal (single and multi-line), all-units-held scenario, rollback of partial reservations, and a concurrent-last-unit race.
- **`describe('a rollback that itself fails')`** — forced-failure paths where `reserveForOrder` writes an order row but the subsequent `deleteOne` or hold-release throws; asserts the customer sees the stock refusal (409), not a 500.
- **`beforeEach`** — calls `resetDomainEvents()` then `registerModules([...])` so inter-module event subscriptions (notably `orders` listening for `RESERVATION_EXPIRED`) are wired.

## Relationships

- **`src/modules/cart/services/index.ts`** — primary test target; `cartService.orderConfirm` and `cartService.cartItemAddById` are exercised in every case.
- **`src/modules/inventory/service.ts`** — `inventoryService.reserveForOrder` is spied on in the rollback-failure block to force a `held: false` outcome deterministically.
- **`src/modules/orders/repository.ts`** — `orderRepository.deleteOne` is spied on to simulate a failed rollback; `readOrder` is imported for order state assertions.
- **`src/modules/orders/module.ts`** — registered so its `RESERVATION_EXPIRED` subscription is active; without it the expiry sweep would release units but leave orders `pending`, making expiry assertions half-blind.
- **`src/kernel/registry.ts`** — `registerModules` wires all module subscriptions before each test.
- **`src/kernel/events.ts`** — `resetDomainEvents` clears the event bus between tests to prevent cross-test leakage.
- **`src/infrastructure/adapters/logger.ts`** — `logger.error` is spied on to assert the rollback-failure log line.
- **`src/modules/cart/repository.ts`** — `cartRepository` imported for cart-state verification (e.g., cart survives a refused checkout).
- **`src/modules/account/module.ts`, `src/modules/delivery/module.ts`, `src/modules/inventory/module.ts`, `src/modules/payments/module.ts`, `src/modules/products/module.ts`, `src/modules/users/module.ts`** — all registered together so their cross-module subscriptions and event handlers are present; the file does not call their services directly (except `productService.findByIdRaw` inside `countersOf`).

## Notes

- **Real Mongo, not mocks.** The file header explicitly states the guarantees are conditional writes a mock cannot show. `setupTestDb()` is called at module top-level.
- **`clearMocks` vs. forced failures.** The rollback-failure block uses `jest.spyOn(...).mockResolvedValue / mockRejectedValue` and must restore with `jest.restoreAllMocks()` in `afterEach` because the global `clearMocks` only empties call logs, not implementations.
- **`available` is always asserted alongside `onHand` and `reserved`.** The file header calls out that checking either counter alone can pass for a shop that never reserved.
- **Concurrent-checkout test uses `Promise.all`** — both pre-flights see the unit as available; the loser is refused by the _conditional reserve_, not the pre-flight. The error's `available: 0` reflects the winner's post-hold state, not what the loser observed earlier.
- **TTL is read lazily on each reserve**, which is what makes `withoutWindow` viable as a per-test override rather than a global setting.
