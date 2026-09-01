# src/modules/products/demo.ts

## Purpose

Defines the products slice of the demo dataset and the seed/export utilities for it. Keeping the data here (rather than in a standalone seed file) means `rm -rf src/modules/products` removes it cleanly, and `scripts/export-demo-dataset.ts` can read it back to publish `db/demo/demo-data.json` for the paired frontend without sharing source code.

## Key elements

- **`SEED_PRODUCT_IDS`** — Named constants (`panino`, `carinoSoftDeleted`, `micionaOutOfStock`, `pufettino`, `bundleInactive`, `barebones`) mapping readable intent to the hex `_id` strings. Other modules import these instead of hardcoding ids.
- **`productFixtures`** — Array of six `makeProduct(...)` calls covering the branches the storefront and repositories actually exercise: visible, soft-deleted (`deletedAt`), out-of-stock (`onHand: 0`), a normal second visible item, inactive (`active: false`), and a minimal record (`barebones`) with only `title` and `price` to exercise model defaults.
- **`seedProductById(productId)`** — Finds a fixture by id; throws a descriptive error if missing. Returns the fixture type as-is (caller reshapes to its own snapshot type). Used by `orders` which embeds a product snapshot.
- **`seedProductsCollection()`** — Upserts all six fixtures via `upsertById(productRepository, …)`. Declared in `module.ts`; called by `db/demo/index.ts`.
- **`exportSeededProducts()`** — Reads the collection back through `exportCollection(productModel, { _id: 1 })`, returning `{ products: … }` sorted by `_id` for byte-stable output. Called by `scripts/export-demo-dataset.ts`.

## Relationships

- **`./fixtures`** — Provides `makeProduct`, which applies `./model`'s `default:` values to any omitted fields.
- **`./model`** — Provides `productModel`, passed to `exportCollection` for the read-back projection.
- **`./repository`** — Provides `productRepository`, the target of `upsertById` during seeding.
- **`@infrastructure/persistence/seed`** — Provides `upsertById`, `exportCollection`, and the `SeedOutcome` type.
- **`module.ts`** — Declares the `seedProductsCollection` and `exportSeededProducts` contracts that this file implements.
- **`cart/demo.ts`**, **`wishlist/demo.ts`**, **`orders/demo.ts`** — Import `SEED_PRODUCT_IDS` and/or `seedProductById` to reference products by name rather than raw hex strings.

## Notes

- The six records are a *test-surface* set, not a realistic catalogue. Each one exists to hit a specific branch (`deletedAt` filter, `onHand === 0`, `active: false`, missing-optional-fields).
- `carinoSoftDeleted` and `bundleInactive` are deliberately independent states: `publicScope()` requires both active **and** not-deleted, so from the outside they behave identically while remaining distinct internally.
- `micionaOutOfStock` uses `onHand: 0` specifically. The other unbuyable path (units held / all reserved) is *not* seeded here — it lives in `orders/demo.ts`.
- `barebones` is public on purpose so it appears in every storefront list; its only distinguishing trait is the absence of every optional field.
- `seedProductById` throws rather than returning `undefined` by design — the error message names the missing id, and the throw lives next to the data it validates instead of being reimplemented in each consumer.
- The export projection includes only `_id: 1` in the sort spec; the actual document shape is whatever the model serialises.
