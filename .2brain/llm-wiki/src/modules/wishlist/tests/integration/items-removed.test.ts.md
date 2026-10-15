---
source: src/modules/wishlist/tests/integration/items-removed.test.ts
sha256: edb912fe64be5807bed5187cba109515bf6c0150fec619330b3165dcf6eb7b83
generated_at: 2026-10-15T12:28:10.558822+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/tests/integration/items-removed.test.ts

## Purpose

Integration test verifying that `productRemoveFromWishlistsById` emits a `WISHLIST_ITEMS_REMOVED` domain event carrying the affected user IDs and the product's localized titles, and that it emits **no** event when the product was absent from all wishlists — ensuring downstream consumers (e.g. notifications) never receive an empty announcement.

## Key elements

- **`describe('productRemoveFromWishlistsById')`** — the single test block in the file.
- **`announced`** (`jest.fn()`) — mock listener registered on `WISHLIST_ITEMS_REMOVED` to capture the event payload.
- **`beforeEach`** — calls `resetDomainEvents()`, resets the mock, and re-registers `announced` via `onDomainEvent(WISHLIST_ITEMS_REMOVED, announced)`.
- **Test: "announces whose wishlists held the product, with its names"** — creates a user and a product, adds the product to the user's wishlist, removes the product by ID, then asserts the event fired once with `{ userIds, productId, titles }`.
- **Test: "announces nothing when no wishlist held it"** — removes a product that was never wishlisted; asserts `announced` was never called.

## Relationships

- **`src/modules/wishlist/service.ts`** — source under test; provides `productRemoveFromWishlistsById` and `wishlistService.wishlistAdd`.
- **`src/modules/wishlist/events.ts`** — exports the `WISHLIST_ITEMS_REMOVED` event identifier used to subscribe the mock listener.
- **`src/kernel/events.ts`** — provides the event-bus primitives `onDomainEvent` and `resetDomainEvents` for subscribe-and-spy testing.
- **`src/modules/users/tests/factories.ts`** — `createUser` builds a persistent user fixture.
- **`src/modules/products/tests/factories.ts`** — `createProduct` builds a persistent product fixture.
- **`tests/support/callers.ts`** — `testCallerContext` supplies the caller argument required by `wishlistAdd`.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` initializes the in-memory/test database before the suite runs.

## Notes

- The event name is `WISHLIST_ITEMS_REMOVED`, but the trigger is **product deletion**, not a user removing an item from their own wishlist. The payload reflects the product-centric perspective (`productId`, `titles`, `userIds`).
- Product IDs are passed as `String(product._id)`, indicating an ObjectId is stringified at the service boundary.
- Event subscription is done via the in-process bus (`onDomainEvent`), not by intercepting a message broker — this is a unit-of-work-level assertion, not a cross-process integration check.
