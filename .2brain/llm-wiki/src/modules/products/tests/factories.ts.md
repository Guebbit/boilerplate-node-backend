---
source: src/modules/products/tests/factories.ts
sha256: 9c88f325dbe4990f63a9082bad317da6102a758e478b32ec11952b8fea1f6b39
generated_at: 2026-11-08T07:50:01.862542+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/factories.ts

## Purpose

Test-database persistence layer for product fixtures. The in-memory builder (`makeProduct`) lives one level up in `../factories.ts`; this file only writes the result to the test database and provides small read/mutation helpers so that cart, account, and address test suites can create, inspect, and clean up product documents without importing production services directly.

## Key elements

- **`makeProduct` / `ProductOverrides`** — re-exported from `../factories`; builds an in-memory product shape.
- **`productRepository`** — re-exported so a sibling test can `jest.spyOn` the live object (a wrapper function would copy the call, not intercept the internal binding).
- **`seedStockLevel(product)`** *(private)* — upserts a row in the raw `stocklevels` collection to mirror the product's `onHand`/`reserved` counters, because the factory bypasses the `PRODUCT_CREATED` event that would normally create that row.
- **`createProduct(overrides?)`** — persists a product (defaults `onHand` to 10), seeds the stock-level row, returns the hydrated Mongoose document.
- **`readProduct(id)`** — hydrated read via `productRepository.findById`; intended for asserting persisted state, not for going through `productService`.
- **`saveProduct(document)`** — persists a document a fixture already built/mutated in memory.
- **`deleteProduct(document)`** — removes a product (cleanup / negative-path fixture).
- **`countersOf(productId)`** — returns the `{ onHand, reserved, available }` triple as `@modules/inventory` stores it, for asserting stock moved after a mutation.

## Relationships

- **`../factories.ts`** — source of `makeProduct` and `ProductOverrides`; both are re-exported here so test files have a single import point.
- **`../repository.ts`** (`productRepository`) — the persistence adapter used by every CRUD helper in this file and re-exported for spy interception.
- **`../model.ts`** (`productModel`) — used by `seedStockLevel` to reach the raw `stocklevels` collection without importing `@modules/inventory`.
- **`../domain/stock.ts`** (`availableStock`) — computes the `available` field for both `seedStockLevel` and `countersOf`.
- **`../services.ts`** (`productService.findByIdRaw`) — used by `countersOf` to read untransformed stock counters.
- **Consumer test files** (cart integration/contract, account contract, addresses integration) — import `createProduct`, `countersOf`, `saveProduct`, `deleteProduct`, `readProduct`, and sometimes `productRepository` from this file to set up and tear down product fixtures.

## Notes

- Exactly one `makeProduct` exists (see `../../users/tests/factories` for the rationale); this file never defines a second builder.
- `seedStockLevel` writes to `stocklevels` **by string name**, never via a model import, to avoid a circular dependency on `@modules/inventory`. This is intentional and mirrors the same collection-by-string pattern that module's `$lookup`s use.
- `createProduct` defaults `onHand` to **10**, not the schema default of 0. Tests that need zero stock must pass `onHand: 0` explicitly.
- `productRepository` is exported solely for `jest.spyOn`; prefer the named helpers (`createProduct`, `countersOf`, etc.) for all other needs.
- `readProduct` is a generic hydrated read. The production barrel deliberately does not publish a generic write path; do not extend this file to add mutation-through-service calls.
