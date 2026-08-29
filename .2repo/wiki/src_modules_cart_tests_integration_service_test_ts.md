# src/modules/cart/tests/integration/service.test.ts

## Purpose

Integration test suite for the cart service, executed against a real MongoDB instance (`setupTestDb`). It exists to pin three fragile behavioral contracts that are easy to break silently: the `set` vs `add` quantity semantics (`$set` vs `$inc`), the serialization guard that strips the populated `product` from `cartGetForBadge` responses, and the storage invariants (no placeholder document, no per-line `_id`, one cart per user). Real Mongo is used deliberately because several tests (especially race-condition tests) depend on the server actually serializing writes to a single document.

## Key elements

- **`describe('cart storage')`** — Asserts the document lifecycle: absent until first write, created via upsert with `createdAt` timestamp, lines stored as `{ productId, quantity }` only (no subdocument `_id`), exactly one cart document per user, `updatedAt` refreshed on each write.
- **`describe('cartGet')`** — The *populated* read path. Returns items with `product` attached (used for pricing). Asserts empty-cart and missing-user behavior, and that a deleted product yields `product: null` while `productId` is preserved.
- **`describe('cartGetForBadge')`** — The *unpopulated* read path. Asserts that `product` is fully stripped (exact key check against the OpenAPI `additionalProperties: false` contract) and that `summary` (`itemsCount`, `totalQuantity`, `total`) is computed correctly.
- **`describe('cartItemSetById')`** — Replaces quantity (`$set`). The critical test sets 5 then 2 and asserts 2, not 7.
- **`describe('cartItemAddById')`** — Increments quantity (`$inc`). The counterpart test sets 5 then adds 2 and asserts 7.
- **`describe('cartItemRemoveById')` / `cartRemove`** — Line removal and full-cart deletion.
- **`describe('orderConfirm')`** — Checkout flow; asserts `enqueueEmail` is called exactly once on success (the "dispatch" contract).
- **`describe('productRemoveFromCartsById')`** — Cascading product deletion removes the line from every user's cart.
- **`storedQuantity`** — Helper that reads the persisted quantity back via `cartRepository.findByUserId`, so assertions survive the Mongo round-trip.
- **`EMPTY_CART` / `MISSING_ID`** — Constants for empty-state assertions and a structurally-valid-but-absent ObjectId.
- **`jest.mock('@infrastructure/adapters/mailer')`** — Only `enqueueEmail` is mocked; the test asserts dispatch happened, not email content (content is covered by the mailer template suite).

## Relationships

- **`@modules/cart/services`** (items, checkout, cleanup, index) — The functions under test (`cartGet`, `cartGetForBadge`, `cartItemSetById`, `cartItemAddById`, `cartItemRemoveById`, `cartRemove`, `orderConfirm`, `productRemoveFromCartsById`) are all imported from here.
- **`@modules/cart/repository`** — `cartRepository` is used directly for storage-level assertions (document shape, count, `createdAt`/`updatedAt`) and as the `storedQuantity` read-back path.
- **`@modules/cart/module`** — Registered via `registerModules` to wire the cart service into the test container.
- **`@kernel/registry`** — `registerModules` bootstraps the module graph (cart, inventory, products, users, orders, account, delivery) so cross-module dependencies resolve.
- **`@kernel/events`** — `resetDomainEvents` clears the domain-event bus between tests to prevent cross-test leakage.
- **`@infrastructure/adapters/mailer`** — `enqueueEmail` is mocked; tests assert it was called (dispatch contract) without inspecting the payload.
- **`@infrastructure/http/response`** — `ResponseReject` type is imported for casting error responses in assertions.
- **`@infrastructure/i18n`** — `t` is imported for i18n-aware error-message assertions; `testCallerContext` supplies the request context.
- **`@modules/inventory/module`, `@modules/delivery/module`, `@modules/account/module`** — Registered so that cross-module side-effects during `orderConfirm` (stock decrement, delivery assignment, account linking) resolve without "module not found" errors.

## Notes

- **`set` vs `add` is the highest-risk contract.** They share one private `upsertCartItem` implementation; the only difference is `$set` vs `$inc` on a single repository line. The test suite includes explicit "5 then set 2 → 2" and "5 then add 2 → 7" assertions specifically because a mutation collapsing them would be invisible in code review.
- **Real Mongo is non-negotiable here.** The file header explicitly states that mocking the repository "would assert the mock." Race-condition tests (concurrent writes to the same cart document) only exercise real serialization guarantees.
- **Two distinct read paths must not be conflated.** `cartGet` *includes* `product` (pricing); `cartGetForBadge` *excludes* it (OpenAPI `additionalProperties: false`). The badge test checks `Object.keys` equality, not just absence of `product`.
- **No per-line `_id`.** Cart lines are bare `{ productId, quantity }` subdocuments. A Mongoose schema change that auto-generates a subdocument `_id` would violate the OpenAPI contract the moment a cart is serialized; the storage test asserts the exact shape.
- **`enqueueEmail` is the only external side-effect mock.** The test asserts the *dispatch* ("a confirmation was sent"), not the email body, which is owned by the mailer template suite.
