---
source: src/modules/cart/tests/integration/merge-effects.test.ts
sha256: 4cf79b2186ac3c23df0770e111e6cbcd34a18daf3191ab4da76a2809eccef99e
generated_at: 2026-11-08T05:21:05.075860+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/merge-effects.test.ts

## Purpose

Integration tests that verify the **observable side effects** of cart merge and product-removal operations: the analytics events emitted per line outcome, the refusal shape when a quantity-cap race occurs, and the `CART_LINES_REMOVED` domain event. These effects are not exercised by the merge answer's own unit tests.

## Key elements

- **`jest.mock('@infrastructure/observability/analytics', …)`** — Replaces the analytics module with a recording wrapper around the real `emitAnalyticsEvent`. Necessary because `jest.spyOn` cannot redefine the non-configurable property a CommonJS namespace import exposes under the swc transform.
- **`describe('a merge's analytics')`** — Three cases asserting that `cartAnalyticsEvents.CART_ITEM_ADDED` fires for a new line, `CART_ITEM_UPDATED` for a grown line, and nothing for an unavailable product id.
- **`describe('a merge that loses a race at the cap')`** — Simulates the `QUANTITY_LIMIT` race by mocking `cartRepository.upsertLine` to resolve `QUANTITY_LIMIT` once; asserts the line is returned with `reason: 'capped'` and no analytics event.
- **`describe('productRemoveFromCartsById')`** — Subscribes to `CART_LINES_REMOVED` via `onDomainEvent`; asserts the event payload (userIds, productId, titles) when a holder exists, and that no event fires when no cart held the product.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/cart/services/index.ts` | Under test: `cartService.merge`, `cartService.addItemById`, `cartService.productRemoveFromCartsById`. |
| `src/modules/cart/analytics.ts` | Provides the `cartAnalyticsEvents` enum used in assertions. |
| `src/modules/cart/events.ts` | Provides the `CART_LINES_REMOVED` constant for domain-event subscription. |
| `src/modules/cart/repository.ts` | `QUANTITY_LIMIT` sentinel and `cartRepository.upsertLine` spied for the race case. |
| `src/kernel/events.ts` | `onDomainEvent` / `resetDomainEvents` to subscribe and clean up domain-event listeners. |
| `src/infrastructure/observability/analytics/index.ts` | Mocked at module level; `emitAnalyticsEvent` is the function under observation. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` seeds the test database before the suite runs. |
| `tests/support/callers.ts` | `testCallerContext` supplies the caller argument to service calls. |
| `tests/support/ports.ts` | `observePort` wraps a jest mock so tests can assert calls without re-mocking. |
| `src/modules/users/tests/factories.ts` | `createUser` creates a persistent user row. |
| `src/modules/products/tests/factories.ts` | `createProduct` creates a persistent product row. |

## Notes

- The analytics mock **delegates** to the real implementation (`jest.fn(actual.emitAnalyticsEvent)`) rather than stubbing it, so any internal side-effects of the real emitter still run. This is a deliberate choice to avoid masking behavior.
- The `QUANTITY_LIMIT` race path is **only** reachable by mocking `upsertLine`; no timing manipulation is used.
- Domain-event tests call `resetDomainEvents()` in `beforeEach` to prevent listener leaks across test files.
