---
source: src/modules/cart/tests/integration/merge-effects.test.ts
sha256: 4cf79b2186ac3c23df0770e111e6cbcd34a18daf3191ab4da76a2809eccef99e
generated_at: 2026-10-29T03:28:23.717875+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/merge-effects.test.ts

## Purpose

Integration tests for the observable side-effects of cart merge and product-removal operations that the answer-shape tests do not cover: the analytics events emitted (or intentionally not emitted) during a merge, the single refusal path that only a concurrent race can trigger, and the `CART_LINES_REMOVED` domain event announced when a product is purged from carts.

## Key elements

- **`jest.mock('@infrastructure/observability/analytics', …)`** — Replaces the analytics module with a recording wrapper around the real implementation. Exposes `emitAnalyticsEvent` as a `jest.fn` so individual tests can assert call count and payload.
- **`describe('a merge's analytics')`** — Three cases asserting that `CART_ITEM_ADDED` fires for a new line, `CART_ITEM_UPDATED` fires when an existing line grows, and nothing fires for an unavailable product id.
- **`describe('a merge that loses a race at the cap')`** — Spies on `cartRepository.upsertLine` to return `QUANTITY_LIMIT` (the only way to simulate the race), then asserts the line is reported as `capped` and no analytics event is emitted.
- **`describe('productRemoveFromCartsById')`** — Subscribes via `onDomainEvent(CART_LINES_REMOVED, …)` and asserts the event fires with the correct `userIds`, `productId`, and localized `titles`; also asserts it does **not** fire when no cart held the product.
- **`observePort`** (from `tests/support/ports.ts`) — Records calls to a port function after setup so each test can inspect exactly what was emitted in its scope.

## Relationships

- **`src/modules/cart/services/index.ts`** — The system under test; all assertions drive `cartService.merge` or `cartService.productRemoveFromCartsById`.
- **`src/infrastructure/observability/analytics/index.ts`** — Mocked at module level; `emitAnalyticsEvent` is the recorded port under observation.
- **`src/modules/cart/analytics.ts`** — Supplies the `cartAnalyticsEvents` enum (`CART_ITEM_ADDED`, `CART_ITEM_UPDATED`) used in expected payloads.
- **`src/modules/cart/events.ts`** — Supplies `CART_LINES_REMOVED`, the domain event the removal tests subscribe to.
- **`src/modules/cart/repository.ts`** — `cartRepository.upsertLine` is spied for the race case; `QUANTITY_LIMIT` is the sentinel the spy returns.
- **`src/kernel/events.ts`** — `onDomainEvent` / `resetDomainEvents` manage the domain-event bus lifecycle per test.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` prepares the in-test database before any test runs.
- **`tests/support/callers.ts`** — Provides `testCallerContext` passed to every `cartService` call.
- **`tests/support/ports.ts`** — Provides `observePort`, the recording helper used in every analytics assertion.
- **`src/modules/users/tests/factories.ts`** / **`src/modules/products/tests/factories.ts`** — `createUser` / `createProduct` seed the fixture rows each test needs.

## Notes

- The `jest.mock` factory exists because `jest.spyOn` cannot redefine the non-configurable property a CommonJS namespace import exposes under the swc transform used in CI. Swapping the whole module with a spread of `jest.requireActual` plus a `jest.fn` wrapper is the supported pattern here.
- The race-condition case is the **only** test that touches `cartRepository` directly; every other test exercises the service through its public API. If `upsertLine` gains new return sentinels, only this block needs updating.
- `resetDomainEvents()` is called in `beforeEach` of the removal block but **not** globally; the analytics blocks do not register domain-event listeners, so the global bus state is irrelevant there.
