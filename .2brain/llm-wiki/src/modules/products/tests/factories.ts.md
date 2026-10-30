---
source: src/modules/products/tests/factories.ts
sha256: 9c88f325dbe4990f63a9082bad317da6102a758e478b32ec11952b8fea1f6b39
generated_at: 2026-10-29T05:31:29.111346+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/factories.ts

## Purpose

Test-database persistence layer for product fixtures. It re-exports the in-memory builder (`makeProduct`) from `../factories.ts` and wraps it with create/read/save/delete helpers so that sibling module tests (cart, account, addresses) can spin up and tear down realistic product documents without reaching into production code paths. It also seeds the `stocklevels` collection, which production populates via a `PRODUCT_CREATED` event this factory deliberately skips.

## Key elements

- **`makeProduct` / `ProductOverrides`** – Re-exported from `../factories.ts` (the builder). No logic added here.
- **`productRepository`** – Re-exported so sibling tests can `jest.spyOn` the actual object `productService` holds internally (a wrapper function would copy the call, not the binding).
- **`createProduct(overrides?)`** – Builds via `makeProduct` (defaulting `onHand` to 10), persists through `productRepository.create`, then calls `seedStockLevel` before returning the Mongoose document.
- **`seedStockLevel`** *(internal)* – Upserts a row in the `stocklevels` collection by writing to `productModel.db.collection('stocklevels')` directly, syncing `onHand`/`reserved`/`available` from the product's own counters.
- **`readProduct(id)`** – Hydrated read via `productRepository.findById`; returns `null` if absent.
- **`saveProduct(document)`** – Persists an in-memory-mutated document (used by sibling fixtures after they edit fields).
- **`deleteProduct(document)`** – Removes a product (cleanup / negative-path setup).
- **`countersOf(productId)`** – Reads `onHand`, `reserved`, and computed `available` via `productService.findByIdRaw`, for tests that assert units actually moved in stock.

## Relationships

- **`../factories.ts`** – Source of the `makeProduct` builder and `ProductOverrides` type; this file adds nothing to the building logic.
- **`../repository.ts`** – Provides `productRepository`, the persistence boundary all CRUD helpers delegate to.
- **`../model.ts`** – Provides `productModel` (used by `seedStockLevel` to reach the raw `stocklevels` collection) and the `ProductDocument` type.
- **`../services.ts`** – Provides `productService.findByIdRaw` used by `countersOf`.
- **`../domain/stock.ts`** – Provides the `availableStock` helper for computing the `available` counter.
- **Cart / Account / Addresses test files** (e.g. `cart/tests/integration/checkout-*.test.ts`, `account/tests/contract/shop.contract.test.ts`) – Import these factories to create, read, save, delete, and assert on product fixtures without duplicating setup logic.

## Notes

- **One builder, one persister.** `makeProduct` is defined only in `../factories.ts`; this file never constructs a product object itself. The same single-source rule is referenced for the analogous `users/tests/factories` split.
- **`onHand` defaults to 10, not 0.** The schema default of 0 is correct for production writes but makes ~89 test call sites needlessly verbose. Tests that need "no stock" set `onHand: 0` explicitly.
- **`seedStockLevel` bypasses the event bus.** Production creates stock-level rows via `PRODUCT_CREATED → receive()`. This factory skips that for speed, so the row must be seeded manually. It writes by collection name (`'stocklevels'`) rather than importing `@modules/inventory`, keeping the dependency direction clean.
- **`productRepository` export is for spying, not reading.** Use `readProduct` / `countersOf` for data access; reach for the raw repository only when the assertion is about the write path itself (failure, retry).
