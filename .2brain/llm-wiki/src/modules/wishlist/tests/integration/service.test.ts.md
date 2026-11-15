---
source: src/modules/wishlist/tests/integration/service.test.ts
sha256: ac297ce78d7dcf60446c614957ca9c57129cf666bf23db39555d47c6178bdc0a
generated_at: 2026-11-14T22:55:08.262381+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/tests/integration/service.test.ts

## Purpose

Integration test suite for `wishlistService` and `wishlistRepository`. Verifies end-to-end service behavior against a real test database: idempotent adds, per-line availability labeling, the product-visibility guard, the configurable wishlist cap (including concurrent-burst safety), removal, export, move-to-cart, and the analytics announcement contract (exactly one `WISHLIST_ITEM_ADDED` per product).

## Key elements

- **`setupTestDb()`** – provisions a throwaway database before the suite runs.
- **`savedIds(userId)`** – helper that reads the wishlist via `wishlistService.get` and extracts product IDs for assertions.
- **`withCap(body)`** – wraps a test body with `NODE_WISHLIST_MAX=3` via `withEnvironmentOverrides`, avoiding the need to save 250 products.
- **`saveProducts(userId, count)`** – creates and saves `count` fresh products, returning their IDs in order.
- **`describe('wishlistRepository.addLine')`** – asserts the `added` flag is `true` on first call and `false` on retry, and that the line count stays at 1.
- **`describe('get: availability per line')`** – verifies the four availability states (`in_stock`, `out_of_stock`, `unavailable`, `removed`), confirms `insufficient_stock` is never emitted, checks re-visibility after `active` toggle, and confirms an off-sale product still moves to cart.
- **`describe('exportLines')`** – asserts the export shape carries only `productId`, no availability field.
- **`describe('add')`** – covers happy path, idempotency, single analytics emission across repeated saves, 404 for soft-deleted (`deletedAt`) products, and 404 for inactive (`active: false`) products.
- **`describe('the wishlist cap')`** – 409 + `WISHLIST_LIMIT_REACHED` code on overflow, 200 idempotent re-add at cap, add-after-remove, and a concurrent-burst guard (8 parallel saves → exactly 3 lines).
- **`describe('remove')`** – removes only the named line, leaving others intact.
- **`describe('moveToCart')`** – (truncated in listing) exercises the service's move-to-cart path.

## Relationships

- **`@modules/wishlist/repository`** – imports `wishlistRepository` and `WISHLIST_LIMIT_REACHED` for direct repository-level assertions and cap code checks.
- **`@modules/wishlist/analytics`** – imports `wishlistAnalyticsEvents` to identify the `WISHLIST_ITEM_ADDED` event in analytics assertions.
- **`@infrastructure/observability/analytics/index`** – the module's `emitAnalyticsEvent` export is replaced with a stub (see `tests/support/ports.ts` for rationale); assertions filter the stub's call log by event name via `observePort`.
- **`@kernel/registry`** – calls `registerModules` so the full module graph is active during tests.
- **`@kernel/events`** – calls `resetDomainEvents` to prevent event leakage between tests.
- **`@kernel/outbox`** – calls `settleOutboxNudges` to flush deferred outbox work before assertions.
- **`@modules/products` / `@modules/products/services`** – imports `productService` to toggle `active` / `purchasable` mid-test.
- **`@modules/products/tests/factories`** – imports `createProduct` to build fixtures with specific stock/purchasability/deletion states.
- **`@modules/users` / `@modules/users/services`** – imports `userService` for user-scoped operations.
- **`@modules/users/tests/factories`** – imports `createUser` to build test accounts.
- **`@modules/cart`** – imports `cartService` to assert cart state after `moveToCart`.
- **`@modules` (root `src/modules.ts`)** – imports `enabledModules` to register the full set under test.

## Notes

- Analytics is **replaced** (not spied). The comment points to `tests/support/ports.ts` for rationale. Use `observePort` from `@tests/ports` to access the stub's call log.
- The cap is enforced **inside the write's own atomic update** (not a pre-check), so the concurrent-burst test (8 parallel `add` calls against cap 3) is the meaningful guard; a naive "check-then-insert" approach would fail it.
- `NODE_WISHLIST_MAX` is read at runtime via `withEnvironmentOverrides`; do not hard-code 250 in tests—always use `withCap`.
- The `addLine` test asserts the repository-level `added` flag directly, which is the *sole* trigger for the `WISHLIST_ITEM_ADDED` analytics event. If the flag semantics change, the analytics test will also break.
- `testCallerContext` is passed as the caller argument to service methods; `callerContextAs` is imported for elevated-context scenarios (e.g., `productService.updateById`).
