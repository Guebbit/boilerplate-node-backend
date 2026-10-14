---
source: src/modules/cart/services/preorder.ts
sha256: 2415c0d130722c08fc687f444b2aac3c505e0448781b2f47c9b5e59881740bd2
generated_at: 2026-10-14T15:12:33.657561+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/preorder.ts

## Purpose

Pre-computes which cart-line products are preorders and reshapes their fields into the shape the availability rule expects. It exists so that cart services can ask the inventory ledger for *allowance* (preorder) rather than *shelf* stock, without the ledger ever knowing what a release date is.

## Key elements

- **`JoinedProduct`** (local type) — `Lean<ProductDocument> | null`; the joined product for a cart line, or `null` if the product was hard-deleted.
- **`preorderIdsOf(lines)`** — Filters a set of cart lines down to those whose joined product is a preorder *as of `new Date()`*, and returns the matching product IDs as a `ReadonlySet<string>`. Intended to be passed to `inventoryService.availableFor`.
- **`availabilityProductOf(product)`** — Maps a single `JoinedProduct` to the `AvailabilityProduct` shape (with `active`, `purchasable`, `deletedAt`, and a pre-computed `preorder` boolean), or `null` if the product was hard-deleted.

## Relationships

- **`src/modules/products/index.ts` / `domain/preorder.ts`** — Imports `isPreorder` (the predicate that decides "is this product before its release date?") and the `ProductDocument` type.
- **`src/modules/products/model.ts`** — Source of the `ProductDocument` type used in `JoinedProduct`.
- **`src/infrastructure/persistence/create-repository.ts`** — Supplies the `Lean<T>` type wrapper (a stripped-down projection of a repository document) used to type the joined product.
- **`src/modules/cart/domain/index.ts` → `availability.ts`** — Exports `AvailabilityProduct`, the structural contract that `availabilityProductOf` conforms to; the availability rule in `availability.ts` consumes that object.
- **`src/modules/cart/services/checkout.ts`, `shelf.ts`, `view.ts`** — Downstream consumers that call `preorderIdsOf` / `availabilityProductOf` before querying inventory.

## Notes

- `isPreorder(product, new Date())` is evaluated **at call time** in every invocation of both exports. If a product's release date falls within the same request, results can be inconsistent across calls. No cached "now" is threaded through.
- `preorderIdsOf` silently skips lines where `product` is `null` (hard-deleted product); those IDs will not appear in the returned set and will not be sent to the ledger.
- The file is intentionally side-effect-free and pure with respect to its inputs (aside from the `new Date()` call), making it safe to call multiple times per request.
