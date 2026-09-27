---
source: src/modules/cart/tests/integration/stock.test.ts
sha256: 32206fc03f47b69e7db8cadc101274bd748c6ec753cf4f56b1eeebb9d2124673
generated_at: 2026-09-27T14:48:27.927908+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/stock.test.ts

## Purpose

Integration test suite for the stock reservation model across the full order lifecycle. Verifies the core invariant that units leave the shop only once PAID: between checkout and payment they are held (reserved), not sold, and recoverable via cancel or expiry sweep. Every case asserts `onHand` and `reserved` together to catch a shop that merely decrements stock. Runs against real MongoDB because the guarantees under test (conditional/atomic writes) cannot be demonstrated with mocks.

## Key elements

- **`setupTestDb()`** — initialises the in-memory (or containerised) Mongo instance for the suite.
- **`beforeEach` block** — calls `resetDomainEvents()` and `registerCheckoutModules([paymentsModule])` so that cross-module event subscriptions (notably `orders` listening for `RESERVATION_EXPIRED`) are active before every test.
- **`withoutWindow` helper** — wraps a test body with `NODE_RESERVATION_TTL_MINUTES=0` so any reservation opened inside it is immediately stale when the sweep reads it. Scoped per-test, not global, because the TTL is read lazily on each reserve.
- **`describe('checkout holds units without selling them')`** — six cases: reservation on confirm, insufficient-stock refusal (single and multi-line), all-units-held-by-another, partial-hold rollback on a failed line, and a concurrent "last unit" race where exactly one checkout wins the conditional write.
- **`describe('a rollback that itself fails')`** — verifies that a refused reserve writes no order and burns no order-number counter, and that the order is still retracted even when `inventoryService.releaseForOrder` rejects. Spies on `orderRepository`, `cartRepository`, `inventoryService`, and `logger`.
- **`countersOf` (from products factories)** — the central assertion helper that reads `{ onHand, reserved, available }` from Mongo after each scenario.

## Relationships

- **`src/modules/cart/services/index.ts`** — `cartService` is the primary system under test (`cartItemAddById`, `orderConfirm`, `cartGetForBadge`).
- **`src/modules/cart/repository.ts`** — `cartRepository.setShippingMethod` prepares the cart; `clearLinesIfUnchanged` is spied in the rollback-failure case.
- **`src/modules/inventory/index.ts` / `src/modules/inventory/service.ts`** — `inventoryService.releaseForOrder` is the release path mocked to simulate a Mongo outage.
- **`src/modules/orders/index.ts` / `src/modules/orders/services/index.ts`** — `orderService` imported for the order-creation side of checkout.
- **`src/modules/orders/repository.ts`** — `orderRepository.create`, `deleteOne`, `incrementOrderNumberCounter` spied to assert rollback boundaries.
- **`src/modules/orders/tests/factories.ts`** — provides `orderRepository`, `readOrder`, `countOrders` test helpers.
- **`src/modules/payments/module.ts`** — registered via `registerCheckoutModules` so the payments subscription is live.
- **`src/modules/products/tests/factories.ts`** — `createProduct` and `countersOf` are the stock-state fixtures and assertions.
- **`src/modules/users/tests/factories.ts`** — `createUser` fixtures for multi-user race tests.
- **`src/kernel/events.ts`** — `resetDomainEvents()` clears the in-memory event bus between tests.
- **`tests/support/callers.ts`** — `testCallerContext` and `asCustomer` provide authenticated caller metadata.
- **`tests/support/checkout-modules.ts`** — `registerCheckoutModules` wires module event subscriptions for the test process.
- **`src/infrastructure/adapters/logger.ts`** — `logger.error` spied (and silenced) in the rollback-failure case.

## Notes

- **Real Mongo, not mocks.** The suite's whole point is conditional (atomic) writes — a mock cannot prove that two concurrent `orderConfirm` calls can't both reserve the last unit. Do not replace the DB with in-memory fakes.
- **`clearMocks` vs `restoreAllMocks`.** Jest's `clearMocks` resets call counts but leaves `mockImplementation`/`mockRejectedValue` in place. The rollback-failure describe block therefore calls `jest.restoreAllMocks()` in its own `afterEach`.
- **Event-driven cross-module edge.** `RESERVATION_EXPIRED` is the only interaction that travels as a domain event rather than a direct call. If `registerCheckoutModules` is skipped, the expiry sweep releases units but leaves orders in `pending`, and the expiry cases pass only half the assertions.
- **Hold precedes order write.** The reservation is taken before `orderRepository.create` is called. A refused reserve therefore has no order to roll back — the tests explicitly assert `createSpy` and `counterSpy` were never invoked.
- **`withoutWindow` is deliberately narrow.** Setting the TTL to zero globally would make every reservation in the suite expire mid-run; the helper exists so only the expiry-specific cases see a closed window.
