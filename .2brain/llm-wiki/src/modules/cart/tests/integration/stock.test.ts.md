---
source: src/modules/cart/tests/integration/stock.test.ts
sha256: c1fa0da785ab230f60ca43dced955f8fbb034ca5a8ad4f62d380212298186f80
generated_at: 2026-10-29T03:30:16.977085+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/stock.test.ts

## Purpose

Integration test suite for the reservation-based stock model across the full order lifecycle (checkout → payment → cancel/expiry). It verifies that units are *held* (`reserved`) at checkout and only leave the shelf (`onHand` decremented) once paid, using a real MongoDB instance so conditional-write guarantees are exercised end-to-end.

## Key elements

- **`withoutWindow(body)`** — helper that runs `body` with `NODE_RESERVATION_TTL_MINUTES=0` via `withEnvironmentOverrides`, making every hold immediately stale for expiry-sweep tests.
- **`describe('checkout holds units without selling them')`** — core suite: verifies `onHand` stays constant and `reserved` increases on successful checkout; covers over-stock refusal, fully-held products, multi-line shortfall reporting, rollback of earlier holds when a later line fails, and concurrent-checkout race (two users, one unit).
- **`describe('a checkout that cannot keep its order')`** — spies on `orderRepository.create` / `incrementOrderNumberCounter` to prove that a refused reserve produces no order document and consumes no order number. Uses `jest.restoreAllMocks()` in `afterEach` because `clearMocks` leaves implementations intact.
- **`beforeEach` block** — calls `resetDomainEvents()` and `registerCheckoutModules([paymentsModule])` so cross-module event subscriptions (notably `RESERVATION_EXPIRED` → orders) are live.

## Relationships

- **`src/modules/cart/services/index.ts`** — `cartService` is the primary actor under test (`addItemById`, `orderConfirm`, `getForBadge`).
- **`src/modules/cart/repository.ts`** — `cartRepository.setShippingMethod` is called directly to satisfy checkout preconditions.
- **`src/modules/orders/repository.ts`** — spied on to assert no order side-effects on refused holds; also provides `readOrder` / `countOrders` helpers.
- **`src/modules/orders/tests/factories.ts`** — exports the `orderRepository` instance used for spying, plus `readOrder` and `countOrders`.
- **`src/modules/payments/module.ts`** — registered in `beforeEach` so its event listeners exist (particularly the `RESERVATION_EXPIRED` → order-status transition edge).
- **`src/kernel/events.ts`** — `resetDomainEvents()` clears the in-memory event bus between tests.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges` / `outboxEventModel` imported for outbox-related assertions in later (truncated) sections.
- **`src/modules/inventory/tests/factories.ts`** — provides `removeLevel` for inventory-level manipulation.
- **`src/modules/addresses/tests/factories.ts`** — `giveAddress` seeds a shipping address so checkout preconditions pass.
- **`src/infrastructure/adapters/logger.ts`** — imported for log-level assertions in later (truncated) sections.

## Notes

- The suite deliberately asserts **both** `onHand` and `reserved` in every stock check; asserting either alone would pass for a system that never reserves.
- `NODE_RESERVATION_TTL_MINUTES` is read lazily on each reserve call, which is why the TTL override is scoped per-test (`withoutWindow`) rather than set globally.
- The concurrent-checkout test uses `toEqual` (not `toMatchObject`) on the refusal `details` to guarantee no extra `available` field leaks into the shopper-facing error.
- `registerCheckoutModules` must run before any test that depends on event-driven cross-module transitions; without it the expiry sweep releases stock but leaves orders stuck in `pending`.
- The file uses real Mongo (`setupTestDb()`), so tests are slower than unit tests but verify conditional-write semantics that in-memory mocks cannot express.
