# src/modules/products/tests/factory.ts

## Purpose

Test-only persistence layer for product fixtures. It re-exports the pure `makeProduct` builder and adds `createProduct`, which writes a product to the test database via the real `productRepository`. This separation lets contract/integration tests in every other module obtain a valid `ProductDocument` with a single import.

## Key elements

- **`makeProduct(overrides?)`** — Re-exported from `../factory`. Returns a plain payload object (no DB write). Only `title` and `price` carry factory defaults; all other schema fields are intentionally omitted so the Mongoose model's own defaults are exercised.
- **`ProductOverrides`** — Re-exported type from `../factory`; the shape of partial overrides accepted by both `makeProduct` and `createProduct`.
- **`createProduct(overrides?)`** — Calls `makeProduct` then `productRepository.create(...)`, returning the resulting Mongoose `ProductDocument`. The only function in this file that touches the database.

## Relationships

- **`../factory`** (`src/modules/products/factory.ts`) — Source of the `makeProduct` builder and `ProductOverrides` type. This file does not redefine them; it re-exports and wraps.
- **`@modules/products`** — Provides `productRepository` (used for the insert) and the `ProductDocument` type (return type of `createProduct`).
- **Cross-module test files** (e.g. `orders/tests/integration/*.test.ts`, `cart/tests/integration/*.test.ts`, `inventory/tests/integration/*.test.ts`, `account/tests/contract/*.test.ts`, `delivery/tests/contract/*.test.ts`) — Import `createProduct` / `makeProduct` from this module to seed product documents in their fixtures.

## Notes

- The builder and the persister are split across two files by design (see the `../../users/tests/factory` comment). Do not duplicate `makeProduct` here; always re-export from `../factory`.
- Only `title` and `price` are defaulted. If you add a new required schema field, update `makeProduct` in `../factory`, not here.
- `createProduct` returns a `Promise<ProductDocument>` — always `await` it before asserting on fields.
