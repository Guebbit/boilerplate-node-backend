---
source: src/modules/wishlist/tests/integration/items-removed.test.ts
sha256: c2157ea8d65d483f683bde65f360a65a395c3ae2ca7ee89ce1a94f53bfb38a2f
generated_at: 2026-10-29T06:35:35.786547+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/tests/integration/items-removed.test.ts

## Purpose

Integration test that verifies `wishlistService.removeByProductId` publishes a `WISHLIST_ITEMS_REMOVED` domain event containing the affected user IDs, product ID, and localized titles — and publishes **nothing** when no wishlist referenced the product (preventing empty notifications).

## Key elements

- **`describe('productRemoveFromWishlistsById')`** — Top-level suite. Registers a spy (`announced`) on the `WISHLIST_ITEMS_REMOVED` event via `onDomainEvent`, resets it in `beforeEach`.
- **"announces whose wishlists held the product, with its names"** — Creates a user and a product, adds the product to the user's wishlist, then calls `removeByProductId`. Asserts the event fired exactly once with `{ userIds: [saver.id], productId, titles }`.
- **"announces nothing when no wishlist held it"** — Calls `removeByProductId` on a product never added to any wishlist. Asserts the event spy was **not** called.

## Relationships

| Neighbor | Role |
|---|---|
| `src/modules/wishlist/service.ts` | SUT — `wishlistService.add` and `wishlistService.removeByProductId` under test |
| `src/modules/wishlist/events.ts` | Exports the `WISHLIST_ITEMS_REMOVED` event constant used to register the spy |
| `src/kernel/events.ts` | Provides `onDomainEvent` / `resetDomainEvents` for event-spy plumbing |
| `src/modules/users/tests/factories.ts` | `createUser` — creates a test user to own a wishlist entry |
| `src/modules/products/tests/factories.ts` | `createProduct` — creates the product being added/removed |
| `tests/support/setup-test-db.ts` | `setupTestDb()` — initializes the in-memory/test database before the suite |
| `tests/support/callers.ts` | `testCallerContext` — standard caller identity passed to service methods |

## Notes

- The `describe` block is named `productRemoveFromWishlistsById`, but the service method actually tested is `removeByProductId`. The name appears to be a historical or alternate label for the same operation.
- The event payload's `titles` field is a localized map (e.g. `{ en: 'Blue mug' }`); the test asserts exact shape, so adding a new locale key or renaming the field will break it.
- The "announces nothing" case is the contract that downstream `notifications` listeners can safely ignore the absence of an event rather than handling an empty `userIds` array.
