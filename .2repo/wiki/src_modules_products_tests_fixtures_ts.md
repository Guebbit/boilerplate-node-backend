# src/modules/products/tests/fixtures.ts

## Purpose

Provides the database-persisting product fixture for tests. It is a thin wrapper around the pure builder `makeProduct` (defined in `../fixtures.ts`) that actually writes a document to the test database via `productRepository.create`, returning the populated Mongoose document. It exists so that integration and contract tests across modules can seed a product with a single call rather than managing repository plumbing inline.

## Key elements

- **`createProduct(overrides?: ProductOverrides)`** — Persists a product built by `makeProduct` into the test database and returns the resulting `ProductDocument`. The `overrides` parameter is forwarded directly to the builder.
- **Re-exports** — `makeProduct` and `ProductOverrides` are re-exported from `../fixtures` so consumers can import both the pure builder and the persisting helper from one path.

## Relationships

- **`../fixtures.ts`** (same module) — Source of the `makeProduct` builder and the `ProductOverrides` type; also the file used to build the demo catalogue. This file delegates all construction logic to it.
- **`@modules/products`** — Supplies the `ProductDocument` type and the `productRepository` used by `createProduct`.
- **Cross-module test files** (account, cart, delivery, inventory, orders — contract and integration tests listed in the graph) — Consume `createProduct` to seed product documents into the shared test database as prerequisite state for their scenarios.

## Notes

- Do **not** add construction logic here. The single source of truth for product shape is `makeProduct` in `../fixtures.ts`; this file's only job is persistence. The header comment points to `../../users/tests/fixtures` as the precedent for keeping exactly one `makeProduct` per module.
- `createProduct` returns a **Promise** (async insert). Tests must `await` it or the document may not be committed before assertions run.
- Because the builder lives one directory up, importing `makeProduct` from `../fixtures` vs. this file is interchangeable — they are the same function. Prefer importing from this file in tests that need the database copy.
