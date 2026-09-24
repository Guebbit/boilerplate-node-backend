---
source: src/modules/products/index.ts
sha256: 7b858d2b808d305405c777eb1afa9c9a5d2ddfd1d479d6e9a1d7c8a1815e980f
generated_at: 2026-09-23T19:26:56.064248+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/index.ts

## Purpose

Public barrel (the module's single import surface) that enforces the strategic-DDD rule: sibling modules may only import what this file re-exports, never internal files. It curates which symbols are visible externally while keeping the repository, schema, and model runtime private to the module.

## Key elements

- **`export * from './service'`** — Exposes `productService` (and any other public service functions). This is the read path siblings use for `onHand`/`reserved` inventory data.
- **`export * from './events'`** — Re-exports product domain events.
- **`export { resolveTaxRate } from './tax'`** — Resolves a product's `taxClass` into a decimal VAT rate. Exposed specifically so the orders module can freeze the rate onto an order line at snapshot time.
- **`export type { TaxClass } from './tax'`** — The tax-class union type, available to consumers without importing the tax module directly.
- **`export * from './domain'`** — Re-exports domain logic (value objects, invariants, etc.).
- **`export type * from './model'`** — Exposes **types only** from the model layer; the runtime (`productSchema`, `applyProductTransform`, `productModel`) and `productRepository` are deliberately *not* exported.

## Relationships

- **`src/modules/inventory/`** (service, module, tests) — The *only* module permitted to write the `onHand`/`reserved` inventory mirror that product reads surface through `productService`.
- **`src/modules/orders/`** (model, module, availability, crud) — Consumes `resolveTaxRate` and `TaxClass` to freeze the VAT rate on order lines; reads product availability/stock via the service.
- **`src/modules/cart/`** (module, items, checkout, reorder, view, integration tests) — Downstream consumer of the barrel; accesses product data (identity, pricing) through the public service surface.

## Notes

- The file is the *sole* import target for any sibling module. Direct imports of `./service`, `./model`, `./tax`, etc. from outside `src/modules/products/` violate the architecture rule in `docs/theory/strategic-ddd.md` §5.
- `productRepository`, `productSchema`, `applyProductTransform`, and `productModel` are intentionally absent from the export list. Do not "fix" this by adding them.
- `export type * from './model'` is type-only; importing a runtime value from `./model` via this barrel will fail at build time.
- `resolveTaxRate` is exported as a named value (not `export *`) to keep the tax module's internal surface minimal.
