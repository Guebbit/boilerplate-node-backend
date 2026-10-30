---
source: src/modules/wishlist/tests/integration/service.test.ts
sha256: 5e7a3af37f56ef67cbfbffb85e9e128f6c5e6de6de5231f9e2b735325d42cc41
generated_at: 2026-10-29T06:35:54.225824+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/tests/integration/service.test.ts

## Purpose

Integration test suite for `wishlistService` and `wishlistRepository.addLine`. It exercises the service's core invariants end-to-end against a real database: idempotent adds, catalogue visibility gates (404 on deleted or inactive products), availability reporting per line, the move-to-cart ordering guarantee (cart write before line drop), and exactly-once analytics emission.

## Key elements

- **`setupTestDb()`** – bootstraps an isolated test database before all suites.
- **`savedIds(userId)`** – helper that calls `wishlistService.get` and extracts the array of `productId`s for assertions.
- **`describe('wishlistRepository.addLine')`** – verifies the `added` flag is `true` on first insert and `false` on repeats (idempotency at the repository level).
- **`describe('get: availability per line')`** – asserts the four availability states (`in_stock`, `out_of_stock`, `unavailable`, `removed`), confirms `insufficient_stock` is never produced, and checks that re-activating a product restores its stock value.
- **`describe('exportLines')`** – confirms the export returns bare `{ productId }` objects with no availability metadata.
- **`describe('add')`** – covers successful save, idempotency, single `WISHLIST_ITEM_ADDED` analytics event across repeated saves, and 404 rejection of soft-deleted or inactive products.
- **`describe('remove')`** – verifies targeted removal and 404 for a line the caller does not hold.
- **`describe('moveToCart')`** – verifies the cart is written before the wishlist line is dropped, quantity increment on an existing cart line, 404 with no cart write for unsaved or de-listed products.
- **`jest.mock('@infrastructure/observability/analytics')`** – replaces `emitAnalyticsEvent` with a jest mock (spread of `requireActual` preserved so other exports remain intact).

## Relationships

- **`@modules/wishlist/service`** (not listed as a neighbor but is the SUT) – all assertions target its public methods.
- **`src/modules/wishlist/repository.ts`** – `wishlistRepository.addLine` is called directly to seed state and to test the repository-level `added` flag.
- **`src/modules/wishlist/analytics.ts`** – `wishlistAnalyticsEvents` enum is imported to filter the analytics spy's calls.
- **`src/infrastructure/observability/analytics/index.ts`** – the analytics port is mocked at the module boundary; tests assert call counts via `observePort`.
- **`src/modules/products/tests/factories.ts`** – `createProduct` factory with options (`onHand`, `purchasable`, `active`, `deletedAt`).
- **`src/modules/users/tests/factories.ts`** – `createUser` factory for test actors.
- **`src/modules/products/index.ts`** / **`src/modules/products/services/index.ts`** – `productService.updateById` is used to toggle `active` mid-test to simulate catalogue visibility changes.
- **`src/modules/cart/index.ts`** / **`src/modules/cart/services/index.ts`** – `cartService.getForBadge` and `cartService.addItemById` are used to verify move-to-cart results and to pre-seed cart state.
- **`src/modules/users/index.ts`** / **`src/modules/users/services/index.ts`** – `userService` imported (likely for cleanup or subscription-reset scenarios in the truncated tail).
- **`src/kernel/registry.ts`** – `registerModules` imported to wire up module event subscriptions in the test environment.
- **`src/kernel/events.ts`** – `resetDomainEvents` imported to clear queued domain events between tests.
- **`src/kernel/outbox.ts`** – `settleOutboxNudges` imported to flush outbox entries so event-side-effects are observable.
- **`src/modules.ts`** – `enabledModules` imported, presumably to scope which modules are active for the test run.

## Notes

- The analytics port is **replaced, not spied on**: the mock uses `jest.requireActual` spread + a single `jest.fn()` override. The comment points to `tests/support/ports.ts` for the rationale. Tests read the spy via `observePort(analyticsPort.emitAnalyticsEvent)` rather than `jest.spyOn`.
- `savedIds` goes through `wishlistService.get` (the service layer), not a raw repository query, so it implicitly exercises the availability-mapping logic on every assertion.
- The "move-to-cart" describe block includes a long comment explaining that the catalogue gate is reached *through* the cart's `addItemById` refusal, and that the relevant edge-case is product *withdrawal* (`active: false`) rather than hard deletion (which is cleaned up by `PRODUCT_DELETED` event subscriptions).
- Several imports (`withEnvironmentOverrides`, `callerContextAs`, `settleOutboxNudges`, `resetDomainEvents`, `registerModules`, `enabledModules`, `userService`) appear in the import block but are not visible in the truncated test bodies; they likely support subscription-cleanup or environment-isolation tests in the portion of the file not shown.
