---
source: src/modules/wishlist/tests/integration/service.test.ts
sha256: 5e7a3af37f56ef67cbfbffb85e9e128f6c5e6de6de5231f9e2b735325d42cc41
generated_at: 2026-11-08T09:14:59.921379+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/tests/integration/service.test.ts

## Purpose

Integration tests for `wishlistService` and `wishlistRepository`, verifying the module's core invariants: idempotent save (`$addToSet`), public-catalogue-only access, the cart-before-drop ordering in `moveToCart`, and per-line availability projection. Runs against a real test database with actual service instances rather than unit-level mocks.

## Key elements

- **`savedIds(userId)`** — helper that calls `wishlistService.get` and returns the `productId` array; used to assert saved-line state across most tests.
- **`describe('wishlistRepository.addLine')`** — asserts the `added` flag is `true` exactly once regardless of retries.
- **`describe('get: availability per line')`** — verifies the four availability states (`in_stock`, `out_of_stock`, `unavailable`, `removed`), confirms `insufficient_stock` is never emitted, and checks that re-activating a product restores its stock value.
- **`describe('exportLines')`** — confirms the export shape carries only `productId`, no availability.
- **`describe('add')`** — covers save-and-return, idempotency, single analytics emission across repeated saves, and 404 refusals for soft-deleted or inactive products.
- **`describe('remove')`** — verifies targeted removal and 404 for a line the caller does not hold.
- **`describe('moveToCart')`** — verifies cart increment (including stacking on an existing cart line), 404 for an unsaved product, and 404 once a product is withdrawn from the public catalogue (with no cart write in either failure case).
- **`jest.mock('@infrastructure/observability/analytics', …)`** — replaces `emitAnalyticsEvent` with a `jest.fn()` so tests can count calls without triggering real observability side-effects.
- **`setupTestDb()`** — initialises the in-memory/Mongo test database before the suite.

## Relationships

- **`src/modules/wishlist/repository.ts`** — `wishlistRepository.addLine` is exercised directly (idempotency test) and indirectly via service calls.
- **`src/modules/wishlist/analytics.ts`** — `wishlistAnalyticsEvents.WISHLIST_ITEM_ADDED` is referenced to filter analytics spy calls.
- **`src/infrastructure/observability/analytics/index.ts`** — `emitAnalyticsEvent` is replaced (not spied) so the test can assert invocation count.
- **`src/modules/cart/services/index.ts`** — `cartService.addItemById` and `cartService.getForBadge` validate the cart-side effect of `moveToCart`.
- **`src/modules/products/services/index.ts`** — `productService.updateById` toggles `active` to simulate catalogue withdrawal/restoration.
- **`src/modules/products/tests/factories.ts`** — `createProduct` seeds products with specific stock/purchasability/active states.
- **`src/modules/users/tests/factories.ts`** — `createUser` seeds the owning user.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges` is imported (used by the test harness to flush queued outbox entries between steps).
- **`src/kernel/events.ts`** — `resetDomainEvents` imported to clear the domain-event bus between tests.
- **`src/kernel/registry.ts`** — `registerModules` imported to wire the module registry for the integration context.
- **`src/modules.ts`** — `enabledModules` imported to register the correct module set.

## Notes

- The analytics mock is a **full module replacement** (`jest.mock` with `requireActual` spread), not a `jest.spyOn`. The in-file comment points to `tests/support/ports.ts` for the rationale; `observePort` from `@tests/ports` is the accessor used to read mock calls.
- The module-level docstring states the ordering contract for `moveToCart`: cart write happens **before** the wishlist line is dropped, so a cart refusal leaves the item "still saved." The tests implicitly verify this by checking cart state in failure paths.
- The `moveToCart` catalogue-gate tests are intentionally written against a **withdrawn** (`active: false`) product, not a hard-deleted one, because `PRODUCT_DELETED` events would have already purged the wishlist line via event subscriptions.
- `settleOutboxNudges` is imported but not visibly called in the truncated portion shown; it is likely used in a `beforeEach`/`afterEach` or helper that was cut off.
