# src/modules/cart/demo.ts

## Purpose
Holds the cart module's slice of the demo/seed dataset. It defines which demo accounts have items in their cart, provides the seeding function for the `carts` collection, and exposes a read-back helper. Only accounts with at least one line-item get a cart document; the absence of a row is itself the fixture for a customer who has never added anything.

## Key elements
- **`cartFixtures`** — Array of cart objects built via `makeCart`. Currently contains a single cart for the seed admin (`SEED_ADMIN_ID`) with two items referencing `SEED_PRODUCT_IDS`.
- **`seedCartsCollection`** — Seeds the `carts` collection by calling `upsertByOwner(cartRepository, cart)` for each fixture. Declared in `module.ts`; invoked by `db/demo/index.ts`.
- **`exportSeededCarts`** — Reads the stored carts back from `cartModel`, sorted by `userId`, and returns `{ carts: [...] }`. Intended for snapshot/debugging, not API responses.

## Relationships
- **`src/infrastructure/persistence/seed.ts`** — Provides `upsertByOwner` (write path) and `exportCollection` (read path) used by `seedCartsCollection` and `exportSeededCarts` respectively.
- **`src/kernel/seed-accounts.ts`** — Supplies `SEED_ADMIN_ID`, the `userId` on the sole seeded cart.
- **`src/modules/products/demo.ts`** — Supplies `SEED_PRODUCT_IDS` (e.g. `panino`, `pufettino`) so cart line-items reference the same product IDs used elsewhere in the demo data.
- **`src/modules/cart/fixtures.ts`** — Provides `makeCart`, the factory that shapes each cart document.
- **`src/modules/cart/model.ts`** — Provides `cartModel`, the Mongoose model targeted by `exportCollection`.
- **`src/modules/cart/repository.ts`** — Provides `cartRepository`, the persistence adapter passed to `upsertByOwner`.
- **`src/modules/cart/module.ts`** — Imports/declares `seedCartsCollection` so the top-level demo seeder can call it.

## Notes
- **No row ≠ empty cart.** If a user has zero items, there is simply no document in the `carts` collection. Code that reads "does this user have a cart?" must treat a missing document and an empty `items` array identically.
- **`exportSeededCarts` returns the *stored* shape, not a `CartResponse`.** No API endpoint serves a raw cart; `./service` constructs the priced response, and the frontend mirrors that construction. Don't confuse the export output with a wire-format DTO.
- **Sort key is `userId`, not `_id`.** Carts are owned by a user and lack a natural stable sort field, so the export sorts by owner for deterministic output.
