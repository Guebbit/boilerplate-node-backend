---
source: src/modules/products/index.ts
sha256: e41c2ea3275c56275bd314155df484ee24e886359d9dd5dfcf3ef7a00bc8e7d4
generated_at: 2026-09-27T15:32:05.425024+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/index.ts

## Purpose

Public barrel for the Products module and the **only** entry point a sibling module may import from (per `docs/theory/strategic-ddd.md` §5). It curates which symbols are exposed externally while keeping the repository, runtime schema, and transform functions strictly internal.

## Key elements

- `export * from './service'` — the `productService` API through which siblings read `onHand`/`reserved` product state.
- `export * from './events'` — domain event definitions emitted by the products module.
- `resolveTaxRate` (from `./tax`) — resolves a product's `taxClass` to a decimal VAT rate; consumed by `orders` to freeze the rate onto an order line at checkout.
- `TaxClass` (type, from `./tax`) — the union/type of tax classifications a product can carry.
- `export * from './domain'` — domain entities / value objects for products.
- `export type * from './model'` — model types only (no runtime values) from the schema layer.
- **Deliberately omitted:** `productRepository`, `productSchema`, `applyProductTransform`, `productModel` — these stay internal; no sibling may import them directly.

## Relationships

- **`src/modules/inventory/*`** — The *only* module allowed to write the `onHand`/`reserved` inventory mirror that `productService` exposes. Inventory's `service.ts` and `module.ts` are the write-side counterpart.
- **`src/modules/orders/services/place.ts`, `crud.ts`, `availability.ts`, `current.ts`** — Consume `productService` (read) and `resolveTaxRate` / `TaxClass` (tax resolution at order time).
- **`src/modules/cart/services/checkout.ts`, `items.ts`, `reorder.ts`, `view.ts`** — Sibling modules that import product data through this barrel (e.g., availability checks, price/tax lookups).
- **`src/modules/orders/model.ts`** — Order line model references `TaxClass` and the frozen tax rate resolved via `resolveTaxRate`.
- **Integration tests** (`cart/tests/…`, `inventory/tests/…`) — Exercise product service behavior indirectly through the barrel exports.

## Notes

- Import rule is strict: a sibling must go through this barrel. Reaching into `./service`, `./model`, etc. directly from outside the module is an architectural violation.
- `productRepository` and the schema runtime are intentionally hidden; if you need to mutate product state, go through `productService`. If you need to *write* inventory quantities, only `@modules/inventory` does that.
- `./model` is exported as **type-only** (`export type *`), so no runtime cost is paid for model definitions in consumer bundles.
