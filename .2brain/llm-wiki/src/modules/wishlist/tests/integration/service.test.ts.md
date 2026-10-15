---
source: src/modules/wishlist/tests/integration/service.test.ts
sha256: 3007d3c8137aa3422bcd18ffc6ecda8c7508560ccb46ad6cfe9858e69ac7cfa9
generated_at: 2026-10-15T12:28:28.493724+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/tests/integration/service.test.ts

## Purpose

Integration tests that pin the domain rules of the wishlist service: idempotent saves via `$addToSet`, 404 on non-public products, move-to-cart ordering (cart write precedes wishlist-line removal so a refusal never "vanishes" the line), and correct per-line availability labelling in the read view. Exercises the real service, repository, cart, and product modules against a test database.

## Key elements

- **`wishlistRepository.addLine`** block — verifies the repository returns `added: true` on first save and `added: false` on repeat, with the collection staying at one line.
- **`wishlistGet: availability per line`** block — asserts the four availability labels (`in_stock`, `out_of_stock`, `unavailable`, `removed`), confirms `insufficient_stock` is never emitted (wishlists hold no quantity), checks the hidden→shown transition restores the stock value, and verifies an off-sale product can still be saved and moved to cart.
- **`wishlistExportLines`** block — confirms the export shape carries only `productId` fields, no availability.
- **`wishlistAdd`** block — happy-path save, idempotency (two calls → one line), single `WISHLIST_ITEM_ADDED` analytics event across three saves, 404 for soft-deleted and for inactive (non-public) products.
- **`wishlistRemove`** block — removes the named line while leaving others; returns 404 when the caller does not hold the line.
- **`wishlistMoveToCart`** block — product lands in cart and line is dropped; increments an existing cart quantity (2 → 3); 404 for a never-saved product with no cart side-effect; catalogue gate enforced through the cart's own refusal.
- **`savedIds`** — small helper wrapping `wishlistService.wishlistGet` to extract the array of saved product IDs for assertions.

## Relationships

- **`src/modules/wishlist/service.ts`** — primary system under test; every `describe` block calls one of its exported methods.
- **`src/modules/wishlist/repository.ts`** — used directly in the `addLine` idempotency test and to seed lines before `wishlistGet` / `wishlistRemove` / `wishlistMoveToCart` scenarios.
- **`src/modules/cart/index.ts`** (`cartService`) — used to pre-seed cart lines, to verify move-to-cart results via `cartGetForBadge`, and to assert the catalogue-gate 404 path.
- **`src/modules/products/index.ts`** (`productService`) — toggles `active` / `purchasable` flags mid-test to drive availability transitions.
- **`src/modules/products/tests/factories.ts`** — `createProduct` seeds products with controlled stock, sale, and deletion states.
- **`src/modules/users/tests/factories.ts`** — `createUser` seeds the acting user.
- **`tests/support/callers.ts`** — `testCallerContext` supplies the caller identity passed to every service mutation.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges` is imported (flushes pending outbox entries between assertions).
- **`src/kernel/events.ts`** — `resetDomainEvents` clears the in-memory event bus between tests.
- **`src/kernel/registry.ts`** — `registerModules` wires module event subscriptions (e.g. product/user deletion cleanup) into the test process.
- **`src/modules.ts`** — `enabledModules` is referenced for module registration scope.
- **`@infrastructure/observability/analytics`** — mocked at the port level; `observePort` (from `tests/support/ports.ts`) inspects emitted analytics calls.

## Notes

- The analytics port is **replaced** (not spied on) via `jest.mock` + spread of `requireActual`; the file comment points to `tests/support/ports.ts` for the rationale. Use `observePort` to read calls—`jest.fn().mock.calls` works but the project convention is the port helper.
- The `withEnvironment` import is present but not exercised in the visible test bodies; it may guard an environment variable for a test below the truncation point.
- Tests rely on `setupTestDb()` (imported from `@tests/setup-test-db`) for per-test database isolation rather than manual teardown.
- The move-to-cart "catalogue gate" tests deliberately trigger the 404 *through* the cart's own refusal rather than asserting a direct product-catalogue check, so a regression in either the cart rule or the wishlist's interpretation of that refusal will fail the test.
