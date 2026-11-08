---
source: src/modules/cart/tests/integration/stock.test.ts
sha256: 975f1e622198b0c2ecd9c270fdafafa22abaac0c8252c96a75cd7a7245b0d696
generated_at: 2026-11-08T05:23:35.201361+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/stock.test.ts

## Purpose

Integration test suite that verifies the reservation model's stock invariants across the full order lifecycle: units are held (not sold) between checkout and payment, are recoverable on cancel/expiry, and only leave inventory upon PAID. Every assertion checks `onHand` and `reserved` together, because either alone could pass for a system that never reserved. Runs against real MongoDB because the guarantees depend on conditional writes that mocks cannot exercise.

## Key elements

- **`setupTestDb()`** — initialises a real Mongo instance for the suite (no in-memory substitute).
- **`beforeEach`** — calls `resetDomainEvents()` and `registerCheckoutModules([paymentsModule])` so cross-module event subscriptions (e.g. orders listening for `RESERVATION_EXPIRED`) are active.
- **`withoutWindow(body)`** — helper that runs `body` under `withEnvironmentOverrides({ NODE_RESERVATION_TTL_MINUTES: '0' })`, making every reservation immediately stale for expiry-sweep tests. Scoped per-test so other cases keep the normal TTL.
- **`describe('checkout holds units without selling them')`** — core behavioural cases: reservation on confirm, insufficient-stock refusal (single and multi-line), full-hold blocking, rollback of earlier holds on failure, and concurrent last-unit race.
- **`describe('a checkout that cannot keep its order')`** — verifies that a refused reservation writes no order and consumes no order number (spies on `orderRepository.create` / `incrementOrderNumberCounter`).
- **`afterEach` (second describe)** — calls `jest.restoreAllMocks()` because `clearMocks` empties call logs but leaves patched implementations in place.

## Relationships

- **`src/modules/cart/services/index.ts`** — primary SUT: `cartService.addItemById`, `cartService.orderConfirm`, `cartService.getForBadge` drive every scenario.
- **`src/modules/cart/repository.ts`** — `cartRepository.setShippingMethod` is called directly to satisfy the checkout precondition without going through the service.
- **`src/modules/inventory/index.ts`** — `inventoryService` imported (used for level management in later cases).
- **`src/modules/inventory/tests/factories.ts`** — `removeLevel` helper for inventory fixture setup/teardown.
- **`src/modules/orders/tests/factories.ts`** — `orderRepository`, `readOrder`, `countOrders` for asserting order side-effects (or their absence).
- **`src/modules/orders/index.ts` / `src/modules/orders/services/index.ts`** — `orderService` imported for post-conditional assertions.
- **`src/modules/orders/repository.ts`** — spied on (`create`, `incrementOrderNumberCounter`) to prove no order is written on refusal.
- **`src/modules/addresses/tests/factories.ts`** — `giveAddress` provides the required address fixture per user.
- **`src/kernel/events.ts`** — `resetDomainEvents()` clears the event bus between tests.
- **`src/kernel/outbox.ts`** — `outboxEventModel`, `settleOutboxNudges` for outbox-related assertions.
- **`src/infrastructure/adapters/logger.ts`** — `logger` imported (likely for noise suppression or assertion on log output).
- **`src/modules/payments/module.ts`** — registered in `beforeEach` so payment-driven events (e.g. PAID → release reservation) have a live subscription.

## Notes

- **Real Mongo is non-negotiable here.** The conditional-write path (atomic increment + check) is the entire point of the reservation model; a mock would make the concurrency test (`two checkouts cannot share the last unit`) meaningless.
- **The `withoutWindow` helper is intentionally scoped.** Setting `NODE_RESERVATION_TTL_MINUTES` globally to `'0'` would expire reservations mid-run in other tests. It is read lazily on each reserve call, which is what makes per-test override possible.
- **Refusal error shape is strict.** The tests use `toEqual` (not `toMatchObject`) on the `details.lines` array to guarantee no extra fields (e.g. `available`) leak to the caller — a deliberate API-contract guard.
- **The race test relies on `Promise.all`.** Both pre-flight checks see the unit as available; only the conditional write at reserve time can serialize them. The loser's error carries `availability: 'out_of_stock'` (vs `'insufficient_stock'` for the pre-flight path), distinguishing "I checked first, you beat me" from "there simply wasn't enough."
- **`afterEach` with `jest.restoreAllMocks()` is required** in the second `describe` because the project's Jest config uses `clearMocks` (empties call logs) rather than `restoreMocks` (removes spy implementations). Forgetting it leaks spies into subsequent tests.
