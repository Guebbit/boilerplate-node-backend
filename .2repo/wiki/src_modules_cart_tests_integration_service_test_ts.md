# src/modules/cart/tests/integration/service.test.ts

## Purpose

Integration tests for the cart service layer, run against a real MongoDB instance (`setupTestDb`). The primary focus is the `set` vs `add` distinction on the shared `upsertCartItem` code path — a regression that silently multiplies or drops a user's quantity — plus the over-serialization guard on the cart view (no extra keys beyond `productId`/`quantity`) and the invariant that a cart is a single per-user document with no per-line `_id`.

## Key elements

- **`mockEnqueueEmail`** — `jest.mock` of `enqueueEmail` from the mailer adapter; asserts dispatch happened, not the email copy.
- **`EMPTY_CART`** / **`MISSING_ID`** — shared constants for the empty-cart shape and a structurally valid but non-existent ObjectId.
- **`asReject(result)`** — narrows an unknown service result to `ResponseReject` for failure-path assertions.
- **`storedQuantity(userId, productId)`** — reads the persisted quantity straight from `cartRepository` so assertions survive the Mongo round-trip.
- **`describe('cart storage')`** — verifies: no document before first write, creation on first add, `createdAt` stamp, absence of line `_id`, exactly one cart per user, `updatedAt` refresh.
- **`describe('cartGet')`** — empty-cart responses, populated product on each line, graceful handling of a deleted product (`product` is `null`, `productId` preserved).
- **`describe('cartGetForBadge')`** — confirms no populated product is leaked (key-set check), multi-line summary arithmetic, zeroed summary for empty cart.
- **`describe('cartItemSetById')`** — the highest-risk seam: set *replaces* (not increments), default quantity 1, isolation between lines, response shape, catalogue-gate refusal for non-public products.
- *(File is truncated; remaining suites cover `cartItemAddById`, `cartItemRemoveById`, `cartRemove`, `orderConfirm`, `productRemoveFromCartsById`.)*

## Relationships

- **`src/modules/cart/services/index.ts`** — primary import source for every service function under test (`cartGet`, `cartItemSetById`, `cartItemAddById`, `orderConfirm`, etc.).
- **`src/modules/cart/repository.ts`** — imported directly for persistence-level assertions (`findByUserId`, `count`) that bypass the service.
- **`src/modules/cart/module.ts`** — registered via `registerModules` to wire DI.
- **`src/modules/inventory/module.ts`**, **`src/modules/account/module.ts`**, **`src/modules/delivery/module.ts`** — registered as peer dependencies required by the cart service graph.
- **`src/infrastructure/adapters/mailer.ts`** — mocked; `enqueueEmail` is asserted to fire on `orderConfirm`.
- **`src/infrastructure/http/response.ts`** — `ResponseReject` type imported for narrowing failure results.
- **`src/infrastructure/i18n/index.ts`** — `t` imported for internationalized assertion strings.
- **`src/kernel/registry.ts`** — `registerModules` called to assemble the module graph.
- **`src/kernel/events.ts`** — `resetDomainEvents` called between tests for isolation.

## Notes

- Tests use **real MongoDB** (not mocks) because the critical behaviour lives in `cartRepository.upsertLine`'s guarded writes, which a mock cannot exercise.
- The `CartItem` schema is `additionalProperties: false`; tests explicitly assert the key set to catch any accidental over-serialization (e.g., a populated `product` object leaking into the badge response).
- The mailer is mocked at the **queue boundary** (`enqueueEmail`), not at the template level — the email *content* is pinned by the mailer template suite, not here.
- `cartGet` and `cartGetForBadge` are intentionally different: the former populates `product` for pricing, the latter strips it. Confusing the two is a class of bug this file guards against.
- The test file is the integration seam; unit tests for individual services (if any) would live alongside `src/modules/cart/services/*`.
