---
source: src/modules/products/index.ts
sha256: dd946343dcb84283d3afd7409c49e359c0d6624f141760e0f8acacd6c8b34dfc
generated_at: 2026-10-15T11:42:08.136177+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/index.ts

## Purpose

Public barrel for the Products module. Per the strategic-DDD rule (§5 of `docs/theory/strategic-ddd.md`), this is the **only** entry point a sibling module may import from. It re-exports the module's service, event, domain, tax, and model-type surfaces while keeping the repository, schema, and runtime model internals private.

## Key elements

- **`export * from './services'`** — Exposes `productService` and other service functions; this is how siblings read product state (e.g. `onHand`, `reserved`) without touching the collection.
- **`export * from './events'`** — Exposes product-domain events for cross-module consumption.
- **`resolveTaxRate`** *(from `./tax`)* — Resolves a product's `taxClass` to a decimal VAT rate. Published specifically so `orders` can freeze the rate onto an order line at checkout (see `services/snapshot.ts`).
- **`TaxClass`, `RateType`** (type-only, from `./tax`) — Type definitions for the tax classification and rate model.
- **`export * from './domain'`** — Exposes product domain logic/contracts.
- **`export type * from './model'`** — Exposes product model types (interfaces, shapes) **types only**; the runtime model (`productSchema`, `applyProductTransform`, `productModel`) and `productRepository` are deliberately **not** exported.

## Relationships

- **`src/modules/cart/module.ts` & `src/modules/cart/services/*`** — The cart module and its services (items, merge, preorder, reorder, shelf, view) consume the product service and types exported through this barrel to check availability, resolve stock flags, and build line items.
- **`src/modules/cart/tests/integration/*`** — Cart integration tests exercise product lookups and stock-state reads that flow through this public surface.
- **`src/modules/delivery/module.ts`** — Delivery module imports product definitions (domain types, events) via this barrel.
- **`@modules/inventory`** (not a graph neighbor listed here, but referenced in the file's docs) — The **only** module permitted to write the product collection; all others read through `productService`.

## Notes

- Sibling modules must **never** import `productRepository`, `productSchema`, `applyProductTransform`, or `productModel` directly — those are internal to the products module and reachable only by `@modules/inventory`.
- The `type *` export from `./model` is intentional: consumers get the shapes for typing but no runtime coupling to the product model implementation.
- `resolveTaxRate` is the one tax-related function exposed at the barrel level; the rest of the tax module internals stay private.
- Canonical module documentation lives at `docs/modules/products.md`.
