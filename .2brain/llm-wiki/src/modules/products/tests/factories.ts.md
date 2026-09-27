---
source: src/modules/products/tests/factories.ts
sha256: d844ba241d6b8f748d1d478ab768c1694612f97992bf017981fc15512fc86f6a
generated_at: 2026-09-27T15:34:23.326199+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/factories.ts

## Purpose

Test-database-persisting helpers for the `products` module. It re-exports the pure in-memory builder from `../factories` and adds thin wrappers around `productRepository` so integration and contract tests across many modules can create, read, mutate, and delete product fixtures without importing the repository directly.

## Key elements

- **`makeProduct` / `ProductOverrides`** — re-exported from `../factories` (the single source of truth for in-memory product construction; also used by the demo catalogue).
- **`seedStockLevel(product)`** *(internal)* — upserts a `stocklevels` row (`onHand`, `reserved`, `available`) so the inventory module's own collection agrees with the product's counters. Written via raw `db.collection('stocklevels')` to avoid importing the inventory module.
- **`createProduct(overrides?)`** — persists a product through `productRepository.create`, then calls `seedStockLevel`. Defaults `onHand` to **10** (schema default is 0) so fixtures are sellable out of the box.
- **`readProduct(id)`** — `productRepository.findById`; a plain hydrated read, deliberately routed through the repository rather than the service.
- **`saveProduct(document)`** — `productRepository.save`; persist a doc a sibling test already mutated in memory.
- **`deleteProduct(document)`** — `productRepository.deleteOne`; outright removal for cleanup or negative-path fixtures.
- **`countersOf(productId)`** — reads `onHand` / `reserved` / `available` via `productService.findByIdRaw` and the `availableStock` helper; used by checkout, payment, and reservation tests to assert stock actually moved.

## Relationships

- **Consumers (importers):** every listed graph-neighbor test file (cart, inventory, orders, delivery, locales, account, addresses) imports `createProduct`, `readProduct`, `saveProduct`, `deleteProduct`, and/or `countersOf` to build and tear down product fixtures.
- **Upstream dependencies (this file imports):** `../model` (`productModel`), `../repository` (`productRepository`), `../factories` (`makeProduct`), `../domain/stock` (`availableStock`), `../service` (`productService.findByIdRaw`).
- **Cross-module write:** `seedStockLevel` writes to the `stocklevels` collection (owned by the `inventory` module) by string name, the same reach the inventory module's `$lookup`s use in the opposite direction.

## Notes

- The split between `../factories` (pure builder, no DB) and this file (DB persistence) is intentional and mirrors the convention in `users/tests/factories`. Only one `makeProduct` exists.
- `onHand` defaults to **10** here, not the schema's **0**. A test that needs zero stock must pin `onHand: 0` explicitly.
- `seedStockLevel` uses `$setOnInsert` with `{ upsert: true }`, so it never overwrites an existing stock row.
- `readProduct` and `saveProduct` go through `productRepository`, **not** `productService`. The service barrel deliberately omits a generic `save`/`update` to avoid an accidental write path; tests that need to mutate should use `saveProduct` explicitly.
- `countersOf` calls `productService.findByIdRaw` — a read-only, untransformed accessor that is safe to call without risking a side-effect write.
