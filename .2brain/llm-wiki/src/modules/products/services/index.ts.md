---
source: src/modules/products/services/index.ts
sha256: 6f95142b94612d1765ae3f8b73ffb38f25e61d0d81e96f09d9eea49b4cac0a5f
generated_at: 2026-11-08T07:47:22.072062+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/services/index.ts

## Purpose

Barrel file that assembles every product-service function into a single `productService` object. It is the sole sanctioned entry point for controllers and sibling modules (per `docs/theory/layers.md`); no other file in the service may be imported directly by a caller outside the products module.

## Key elements

- **`productService`** — the only meaningful export. Aggregates search, read, create/update, remove/restore, and lookup functions from the sub-modules (`search`, `read`, `translated-write`, `remove`, `lookups`) into one flat object.
- **`toProduct(document, caller?)`** — converts a `ProductDocument` to the wire-shape `Product`. Applies `presentProduct` then `redactStock`, gating the stock counters behind `canSeeStock(caller)`. Exposed here (rather than from the presenter) so sibling modules can shape a product for a response without reaching into `../presenter`.
- **`canSeeStock`** — re-exported from `./stock-view`. A shared predicate so a sibling's refusal message can reference the same rule.
- **`zodProductCreateSchema` / `zodProductReplaceSchema` / `zodProductUpdateSchema`** — re-exported from `../model`. Exposed here because the update controller's validation factory needs them and is not permitted to import `./model` directly.
- **`clearOmittedLocales`** — write-path helper from `translated-write` for dropping translation rows on locales removed in an update.
- **Lookup helpers** (`findByIdRaw`, `findByIdRawScoped`, `isLive`, `findPublicById`, `findManyByIds`, `countPublic`, `listPublicPage`, `countListed`, `syncStockCache`, `titlesOf`, `titlesById`) — the "door" siblings read through; see `./lookups`.

## Relationships

- **`src/modules/cart/services/items.ts`, `merge.ts`, `shelf.ts`, `view.ts`** — consume the lookup and availability surface of `productService` (e.g. `findByIdRaw`, `isLive`, `findManyByIds`, `syncStockCache`) to resolve product state during cart operations.
- **`src/modules/cart/module.ts`** — wires the cart module to the product service at the module-graph level.
- **Cart integration/contract tests** (`checkout-expected-total`, `line-availability`, `product-removal-protects-orders`, `product-restored-meanwhile`, `preorder`, `merge`, `service`, etc.) — exercise product lookup, stock, and lifecycle transitions through this surface, confirming cart behaviour against product state.

## Notes

- The file is deliberately a *pass-through*: it adds no business logic of its own beyond `toProduct`. All real logic lives in the named sub-files.
- The comment explicitly forbids controllers or siblings from importing a sub-file (e.g. `./read`) directly; they must go through `productService`. Violating this breaks the layering contract described in `docs/theory/layers.md`.
- `toProduct` is the one function *defined* in this file (not re-exported). It composes presenter + stock-view and is the canonical shape-conversion point for cross-module use.
