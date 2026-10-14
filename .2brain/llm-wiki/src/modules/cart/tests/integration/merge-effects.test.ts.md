---
source: src/modules/cart/tests/integration/merge-effects.test.ts
sha256: 0c69659cc6242c3ee7e1a79b14067e4196e39523f9436ff8474df0b3f16a9ece
generated_at: 2026-10-14T15:16:09.709345+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/merge-effects.test.ts

## Purpose

Integration tests that verify the **observable side effects** of cart merge and product-removal operations — analytics emissions and domain-event announcements — which the primary answer/return-value tests do not cover. Ensures dashboards keep receiving data and that `CART_LINES_REMOVED` fires only when there is actually something to announce.

## Key elements

- **`describe('a merge's analytics')`** — Three cases: a new line emits `CART_ITEM_ADDED`, a line that grows emits `CART_ITEM_UPDATED`, and an unknown/unavailable product emits nothing.
- **`describe('a merge that loses a race at the cap')`** — Simulates a concurrent write by mocking `cartRepository.upsertLine` to return `QUANTITY_LIMIT`; asserts the response line is marked `reason: 'capped'` and no analytics fire.
- **`describe('productRemoveFromCartsById')`** — Subscribes to `CART_LINES_REMOVED` via `onDomainEvent`; verifies the payload (userIds, productId, titles) when a holder exists and that the event is *not* emitted when no cart held the product.
- **Analytics port mock** — Replaces `emitAnalyticsEvent` with a `jest.fn` wrapper around the real implementation (not a plain spy) to work around a CJS/swc non-configurable property issue.
- **`observePort`** — Test helper that captures calls to the mocked `emitAnalyticsEvent`.

## Relationships

- **`@infrastructure/observability/analytics`** — The port under test; mocked at the module boundary with a recording wrapper.
- **`@kernel/events`** — Provides `onDomainEvent` / `resetDomainEvents` used to subscribe to and clean up `CART_LINES_REMOVED` listeners.
- **`@modules/cart/analytics`** — Source of the `cartAnalyticsEvents` enum values asserted in analytics expectations.
- **`@modules/cart/events`** — Exports the `CART_LINES_REMOVED` event constant.
- **`@modules/cart/repository`** — `cartRepository.upsertLine` is spied on to simulate the race; `QUANTITY_LIMIT` is the sentinel value returned.
- **`@modules/cart/services`** — Re-exports `cartMerge`, `cartItemAddById`, `productRemoveFromCartsById` (the SUTs).
- **`@tests/setup-test-db`**, **`@tests/callers`**, **`@tests/ports`** — Test infrastructure: DB setup, caller context, and port-observation helper.
- **`@modules/users/tests/factories`** / **`@modules/products/tests/factories`** — Create the `User` and `Product` fixtures required by each scenario.

## Notes

- The analytics mock deliberately avoids `jest.spyOn` on the namespace import because the swc transform (used in mutation runs) makes the property non-configurable; the `jest.mock` factory spreads `requireActual` and overrides only `emitAnalyticsEvent`.
- The race-condition test is the *only* place `cartRepository` is spied on; it uses `mockResolvedValueOnce` so subsequent calls hit the real implementation.
- `resetDomainEvents()` in `beforeEach` prevents listener leakage between the two `productRemoveFromCartsById` cases.
- This file tests effects only; the merge response shape and happy-path logic are asserted in the companion answer tests.
