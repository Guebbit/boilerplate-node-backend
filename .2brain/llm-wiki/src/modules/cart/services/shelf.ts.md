---
source: src/modules/cart/services/shelf.ts
sha256: ce84ec642fb4f08f8c941c3e5b13c359aac9b09ffbaec34a73ed7bd710932ada
generated_at: 2026-10-14T15:13:23.113482+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/shelf.ts

## Purpose

Defines the "shelf" — a single-product join of its catalogue document and inventory-ledger units for sale — and the two-query read that materialises it for any set of product ids. Exists so cart operations (merge, wishlist checks) get a consistent availability answer from one place instead of scattering catalogue and inventory calls.

## Key elements

- **`Shelf`** (interface) — Pairs `product` (`Lean<ProductDocument> | null`, null = hard-deleted) with `available` (ledger units; `undefined` if no level row exists).
- **`readShelf(productIds)`** — Deduplicates ids, runs `productService.findManyByIds` then `inventoryService.availableFor(ids, preorders)`, returns `Promise<Map<string, Shelf>>` preserving first-seen order.
- **`shelfAvailability(shelf, quantity?)`** — Applies the cart's availability precedence rule (`lineAvailability`) to a single shelf; `quantity` omitted for wishlist/bare checks.
- **`productAvailabilityFor(productIds)`** — Convenience wrapper over `readShelf` → `shelfAvailability` for quantity-less availability lookups (wishlist lines).

## Relationships

- **`../domain` (availability)** — Imports `lineAvailability` and the `LineAvailability` type; `shelfAvailability` delegates entirely to it.
- **`./preorder`** — Imports `preorderIdsOf` (to filter preorder ids before the ledger query) and `availabilityProductOf` (to normalise the product shape before the availability rule runs).
- **`@modules/products`** — Calls `productService.findManyByIds` for the catalogue leg; uses `ProductDocument` and `Lean` in the `Shelf` shape.
- **`@modules/inventory`** — Calls `inventoryService.availableFor(ids, preorders)` for the ledger leg.
- **`@infrastructure/persistence/create-repository`** — Provides the `Lean<T>` type used to type the unscoped product join.
- **`./index.ts`** — Re-exports this module for external importers.
- **`./merge.ts`** — Sibling service in the cart domain; part of the same query-per-request budget described in the module doc.

## Notes

- The module doc references `docs/modules/cart.md#stock-checked-in-three-places` for the broader invariant: this shelf read is one of three places stock is checked.
- `product` in `Shelf` is an *unscoped* join — hidden or soft-deleted products still resolve; only hard-deleted ones yield `null`.
- The two-query invariant (catalogue → ledger) is load-bearing: the ledger query needs the preorder list derived from catalogue results, so the queries are sequential, not parallel.
- `available` is `number | undefined`, not `number` — the absence of a level row is a distinct state from "zero units."
