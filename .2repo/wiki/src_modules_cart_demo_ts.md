# src/modules/cart/demo.ts

## Purpose

Owns the cart module's slice of the demo/seed dataset: defines the fixture documents, the upsert logic that loads them, and a read-back export. It exists so cart seed data lives in the module that owns the collection rather than being nested inside another module's (e.g. user) documents.

## Key elements

- **`cartFixtures`** — Array of one cart document (admin user, two line items referencing seeded product IDs). Only users with a non-empty cart get a row; absence *is* the empty-cart state.
- **`upsertByOwner`** (private) — Looks up an existing cart by `userId` via `cartRepository.findByUserId`; skips if present, otherwise creates. Uses the owner as the identity key because carts have no pinned `_id`.
- **`seedCartsCollection`** (exported) — Runs `upsertByOwner` over all fixtures in parallel; returns `SeedOutcome[]`. Declared in `module.ts` and invoked by the top-level demo seeder.
- **`exportSeededCarts`** (exported) — Reads carts back via `exportCollection` on `cartModel`, sorted by `userId`. Returns the **stored** shape (not `CartResponse`), since no endpoint serves a raw cart document directly.

## Relationships

- **`src/kernel/seed-accounts.ts`** — Imports `SEED_ADMIN_ID` to tie the single fixture to the seeded admin user.
- **`src/modules/products/demo.ts`** — Imports `SEED_PRODUCT_IDS` (`.panino`, `.pufettino`) so cart line items reference the same seeded products.
- **`src/modules/cart/factory.ts`** — Uses `makeCart` to build well-formed fixture documents.
- **`src/modules/cart/model.ts`** — Imports `cartModel` for the `exportSeededCarts` read-back query.
- **`src/modules/cart/repository.ts`** — Uses `cartRepository.findByUserId` and `cartRepository.create` for the upsert path.
- **`src/infrastructure/persistence/seed.ts`** — Imports `SEED_SAVE_OPTIONS`, the `SeedOutcome` type, and `exportCollection` helper.
- **`src/modules/cart/module.ts`** — Declares `seedCartsCollection` as part of the module's public seed API.

## Notes

- The single fixture is for the **admin** only. A regular seeded user intentionally has **no** cart row — that absence is the fixture for "a person who has never added anything."
- Upsert keys on `userId`, not `_id`. Carts are identified by their owner; there is no stable document ID to key on.
- `exportSeededCarts` returns the raw stored shape. The `CartResponse` (with pricing) is built later by `./service`; do not expect priced fields in the export.
