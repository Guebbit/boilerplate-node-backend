---
source: src/modules/cart/services/preorder.ts
sha256: f34c97a47277d0099e4f74e485f33ec953e0d74a48241d6d7e4b754d9f4f896d
generated_at: 2026-11-08T05:17:50.314617+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/preorder.ts

## Purpose

Classifies cart-line products as preorder or backorder *before* the cart asks the inventory/ledger service for availability. Because `inventory` has no concept of a release date, the cart uses the catalogue's product facts (`isPreorder`, `isBackorder`) to decide which product IDs to route through the allowance path versus the shelf path, and to hand the availability rule the correct product shape.

## Key elements

- **`preorderIdsOf(lines)`** — Returns a `ReadonlySet<string>` of product IDs that are currently preorders (release date is in the future). These IDs are what gets passed to `inventoryService.availableFor` so it reads the preorder allowance instead of shelf stock.
- **`backorderIdsOf(lines)`** — Returns a `ReadonlySet<string>` of product IDs that are currently purchasable on backorder. These IDs are allowed to spill past the shelf into the backorder cap.
- **`availabilityProductOf(product)`** — Projects a joined `ProductDocument` into an `AvailabilityProduct`, adding the already-decided `preorder` and `backorder` boolean flags alongside `active`, `purchasable`, and `deletedAt`. Returns `null` for hard-deleted products.
- **`JoinedProduct`** (local type) — `Lean<ProductDocument> | null`; the shape of a product as it arrives from a join (null meaning the row was hard-deleted).

## Relationships

- **`src/modules/products/index.ts`** — Source of `isPreorder`, `isBackorder`, and the `ProductDocument` type. The cart delegates the "is this a preorder right now?" decision to the products module.
- **`src/modules/products/domain/preorder.ts` / `src/modules/products/domain/backorder.ts`** — Implement the predicates actually called by the two `*IdsOf` functions and `availabilityProductOf`.
- **`src/infrastructure/persistence/create-repository.ts`** — Provides the `Lean<T>` wrapper type used in the `JoinedProduct` alias.
- **`src/modules/cart/domain/index.ts`** — Exports the `AvailabilityProduct` type that `availabilityProductOf` returns; that type is defined in the sibling `availability.ts`.
- **`src/modules/cart/services/checkout.ts` / `view.ts` / `shelf.ts`** — Consumers that call these three functions to build the argument sets and product facts the availability/checkout logic needs.

## Notes

- The date check (`new Date()`) is evaluated at *call time*, not at module load. This means a product can cross its release boundary mid-session; the classification is always "now."
- `null` products (hard-deleted rows) are silently excluded from both ID sets and cause `availabilityProductOf` to return `null` — callers must handle the absent entry rather than expecting a product object.
- This file is intentionally thin: it does no I/O and makes no repository calls. Its sole job is to translate catalogue facts into the shape the cart's availability rule and the inventory service expect.
