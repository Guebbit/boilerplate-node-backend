---
source: src/modules/wishlist/tests/integration/items-removed.test.ts
sha256: c2157ea8d65d483f683bde65f360a65a395c3ae2ca7ee89ce1a94f53bfb38a2f
generated_at: 2026-11-08T09:14:42.778576+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/tests/integration/items-removed.test.ts

## Purpose

Integration test verifying that `wishlistService.removeByProductId` emits a `WISHLIST_ITEMS_REMOVED` domain event (with the affected user IDs, product ID, and localized titles) when at least one wishlist contained the product, and emits **no** event when no wishlist did — ensuring `notifications` never writes a message about nothing.

## Key elements

- **`describe('productRemoveFromWishlistsById')`** – the test suite wrapping two cases.
- **`announced` (jest.fn)** – registered via `onDomainEvent(WISHLIST_ITEMS_REMOVED, announced)` in `beforeEach` to act as a spy on the domain event.
- **Test 1 – "announces whose wishlists held the product, with its names"** – creates a user and product, adds the product to the user's wishlist, calls `removeByProductId`, then asserts the event fired exactly once with `{ userIds, productId, titles }`.
- **Test 2 – "announces nothing when no wishlist held it"** – calls `removeByProductId` on a product with no wishlist entries and asserts the spy was never called.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/wishlist/service.ts` | Unit under test – calls `add` and `removeByProductId`. |
| `src/modules/wishlist/events.ts` | Supplies the `WISHLIST_ITEMS_REMOVED` event constant used to subscribe the spy. |
| `src/kernel/events.ts` | Provides `onDomainEvent` (subscribe) and `resetDomainEvents` (cleanup between tests). |
| `src/modules/users/tests/factories.ts` | `createUser` – builds a test user. |
| `src/modules/products/tests/factories.ts` | `createProduct` – builds a test product. |
| `tests/support/callers.ts` | `testCallerContext` – supplies the caller context argument for `wishlistService.add`. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` – initialises the in-memory test database before the suite runs. |

## Notes

- The `describe` label is `productRemoveFromWishlistsById` while the service method under test is named `removeByProductId` — a minor naming drift to be aware of when searching by method name.
- Event isolation relies on calling `resetDomainEvents()` **and** `announced.mockReset()` in every `beforeEach`; omitting either can leak state between tests if the subscription registry is shared.
- The `titles` field in the event payload is a locale-keyed object (`{ en: '…' }`), not a plain string; any consumer must pick a locale.
