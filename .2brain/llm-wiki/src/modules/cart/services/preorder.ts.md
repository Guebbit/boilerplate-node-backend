---
source: src/modules/cart/services/preorder.ts
sha256: f34c97a47277d0099e4f74e485f33ec953e0d74a48241d6d7e4b754d9f4f896d
generated_at: 2026-10-29T03:25:19.341335+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/preorder.ts

## Purpose

Classifies cart line items as preorder or backorder using the product's release date, and reshapes joined products into the structure the cart's availability rule expects. It exists so the cart can name *which* products need allowance-based (preorder) or cap-based (backorder) availability checks before delegating the actual quantity logic to the inventory/ledger service.

## Key elements

- **`preorderIdsOf(lines)`** — Filters lines to products currently in their preorder window (`isPreorder`), returns a `ReadonlySet<string>` of product IDs to hand to `inventoryService.availableFor`.
- **`backorderIdsOf(lines)`** — Same shape, but for products currently in their backorder window (`isBackorder`). Returned IDs indicate lines whose quantity may exceed shelf stock up to the product's cap.
- **`availabilityProductOf(product)`** — Projects a joined product (or `null`) into the `AvailabilityProduct` record the domain availability rule reads, including pre-computed `preorder` and `backorder` booleans.
- **`JoinedProduct`** (type) — `Lean<ProductDocument> | null`; the `null` variant represents a hard-deleted product row.

## Relationships

- **`src/modules/products/index.ts`** — Source of `isPreorder`, `isBackorder`, and the `ProductDocument` type. The catalogue owns the date-comparison logic; this file only calls it.
- **`src/infrastructure/persistence/create-repository.ts`** — Source of the `Lean<T>` mapper type used to model a joined (non-hydrated) product row.
- **`src/modules/cart/domain/index.ts`** — Source of the `AvailabilityProduct` shape that `availabilityProductOf` must produce, consumed downstream by the availability rule.
- **`src/modules/cart/domain/availability.ts`** — The rule that reads `AvailabilityProduct`; this file is its feeder for the preorder/backorder flags.

## Notes

- `new Date()` is evaluated at each call, not at module load — classification is always relative to "now" at invocation time.
- All three exports guard against `null` (hard-deleted product). `availabilityProductOf` returns `null` (not `undefined`) for that case; callers must handle it.
- Architectural boundary per the docstring: this file (catalogue side) *decides* whether a product is a preorder/backorder; the inventory/ledger side only sees the remaining allowance or cap and has no concept of a release date.
- Returned sets are `ReadonlySet` — treat as immutable; do not mutate downstream.
