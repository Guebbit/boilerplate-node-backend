# src/modules/cart/demo.ts

## Purpose

Declares the cart's share of the demo dataset: which seeded users get a cart row, what items are in each cart, and the functions to upsert and read those rows back. It lives here (the cart module) rather than nested under each user so the cart collection is owned and stated where it belongs.

## Key elements

- **`cartFixtures`** — Array of four cart objects (admin + marcus, harper, isla). Each is built via `makeCart` with a fixed id, a `userId`, and two line items. The remaining seven demo customers intentionally have no entry; absence *is* their fixture.
- **`demoCartId(index)`** (local) — Builds a deterministic hex string prefixed `67f0c3` so cart ids never collide with other collections' id spaces.
- **`seedCartsCollection()`** — Upserts every entry in `cartFixtures` through `cartRepository` using `upsertByOwner`. Declared in `module.ts`; invoked by the demo bootstrap (`db/demo/index.ts`).
- **`exportSeededCarts()`** — Reads all stored carts back via `exportCollection(cartModel, { userId: 1 })` and returns them keyed under `"carts"`. The shape is the raw stored document, not a `CartResponse`.

## Relationships

- **`@infrastructure/persistence/seed`** — Supplies `SeedOutcome`, `exportCollection`, and `upsertByOwner`, the generic seed primitives this file drives.
- **`@kernel/seed-accounts`** — Exports `SEED_ADMIN_ID`, the userId for the admin cart row.
- **`@modules/products/demo`** — Exports `SEED_PRODUCT_IDS` (named products for the admin cart) and `fillerProductId(n)` (combinatorial-catalogue items for the "medium" customer carts).
- **`@modules/users/demo`** — Exports `SEED_CUSTOMER_IDS` (marcus, harper, isla, etc.); also documents the deterministic-id convention this file mirrors.
- **`./fixtures`** — Provides `makeCart`, the factory that shapes each fixture object.
- **`./model`** — Provides `cartModel` (the Mongoose model) used by `exportSeededCarts`.
- **`./repository`** — Provides `cartRepository`, the upsert target for `seedCartsCollection`.
- **`./module`** — Declares `seedCartsCollection` in the module's public seed manifest.

## Notes

- **Missing rows are intentional.** Seven of eleven demo customers have no cart document. Code that iterates "all users" and fetches their cart must treat a `null`/empty result as a valid state, not an error.
- **`exportSeededCarts` is read-only introspection.** It does not price lines or build a `CartResponse`; that logic lives in `./service`. Use it only for debugging or snapshot comparisons.
- **Id prefixes are load-bearing.** The `67f0c3` prefix on `demoCartId` and the hardcoded `65dd2c9e…` on the admin cart exist to keep id spaces disjoint across collections. Don't replace them with random `ObjectId`s.
- **Sort key is `userId`.** Carts have no natural `_id` ordering that's meaningful across runs; `exportSeededCarts` sorts by `userId` for stable output.
