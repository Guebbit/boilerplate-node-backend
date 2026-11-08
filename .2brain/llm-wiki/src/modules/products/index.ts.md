---
source: src/modules/products/index.ts
sha256: 9e6ad060292d3da1b9479a088425feb2b41cb07bcfe3b061ebb46eeb6ea205a5
generated_at: 2026-11-08T07:44:36.089220+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/index.ts

## Purpose

Public barrel for the Products module. It is the **only** import surface that a sibling module (e.g. `cart`, `orders`) may use, per the strategic DDD rule in `docs/theory/strategic-ddd.md` §5. It re-exports the module's public API while deliberately keeping internal implementation (`productRepository`, `productSchema`, `applyProductTransform`, `productModel`) private.

## Key elements

- **`./services`** (re-exported) — the service layer, including `productService` which is the sanctioned way for siblings to read the `onHand`/`reserved` mirror.
- **`./events`** (re-exported) — domain events emitted by the products module.
- **`productPagePath`** (`./config`) — builds the frontend URL for a product page; consumed by the sitemap generator and back-in-stock email links.
- **`resolveTaxRate`** (`./tax`) — resolves a product's `taxClass` into a decimal VAT rate so `orders` can freeze the rate onto an order line at checkout (see `services/snapshot.ts`).
- **`TaxClass`, `RateType`** (`./tax`, types) — supporting type definitions for the tax resolution contract.
- **`./domain`** (re-exported) — domain logic / entities.
- **`./model`** (re-exported, types only) — the data model schema as types.

## Relationships

- **`src/modules/cart/*`** — The cart module (its `module.ts`, services such as `items`, `merge`, `preorder`, `shelf`, `view`, and its integration/contract tests) consumes the Products public API through this barrel. Cart reads product availability and metadata via the re-exported services; it never touches `productRepository` or the raw model directly.
- **`@modules/inventory`** — Named in the file's docstring as the *only* module that writes to the product collection. Not a graph neighbor here, but it is the exclusive writer counterpart to the read-only surface this barrel exposes.

## Notes

- **Encapsulation boundary.** Importing anything from `src/modules/products/` sub-paths directly (bypassing this index) is a rule violation. The internal model runtime and repository are intentionally omitted.
- **Read vs. write split.** Siblings may *read* `onHand`/`reserved` via `productService` (re-exported here); *writing* is reserved for `@modules/inventory`.
- **`resolveTaxRate` is a deliberate exception** to the "services-only" surface: it is a pure function published so `orders` can snapshot the tax rate at checkout without reaching into Products' internals.
- **Type-only re-export of `./model`** (`export type *`) means the model shapes are available for typing but the runtime schema object itself is not importable by siblings.
