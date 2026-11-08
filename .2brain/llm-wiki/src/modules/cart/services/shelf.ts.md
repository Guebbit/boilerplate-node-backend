---
source: src/modules/cart/services/shelf.ts
sha256: 084ce58429254c6811d7ebf9407c2876fad31d065db9e77332004d36621f5174
generated_at: 2026-11-08T05:18:17.471973+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/shelf.ts

## Purpose

Provides the "shelf" abstraction: a single read of a product's catalogue document **and** its inventory ledger units, combined into one record. All cart availability decisions (merge, wishlist, preorder checks) funnel through this file so the catalogue and ledger are fetched in exactly two queries regardless of product count.

## Key elements

- **`Shelf`** (interface) — One product's shelf: the product document (`null` = hard-deleted), the ledger's `available` units, and an optional `shelf` count (the portion the shelf covers vs. backorder/preorder spillover).
- **`readShelf(productIds)`** — Deduplicates ids, queries `productService.findManyByIds` then `inventoryService.availableFor` (passing preorder/backorder id sets from `./preorder` helpers), and returns a `Map<string, Shelf>` preserving first-seen order.
- **`shelfAvailability(shelf, quantity?)`** — Applies the cart's single precedence rule (via `lineAvailability` from `../domain`) to a shelf, using the ledger's count rather than any cached catalogue copy.
- **`isListed(shelf)`** — Convenience boolean: `true` when the catalogue shows the product publicly (i.e. availability is not `'removed'`).
- **`productAvailabilityFor(productIds)`** — Batch "is it listed / what's its state" for wishlist-style lines (no quantity); returns `Map<string, LineAvailability>` and never yields `'insufficient_stock'`.

## Relationships

- **`@modules/products`** (`productService`, `ProductDocument`) — Source of catalogue documents; `findManyByIds` is the first of the two queries.
- **`@modules/inventory`** (`inventoryService`) — Source of ledger units; `availableFor` is the second query and receives preorder/backorder id lists.
- **`./preorder`** (`availabilityProductOf`, `backorderIdsOf`, `preorderIdsOf`) — Transforms product data into the id subsets the inventory service needs, and adapts the raw product for `lineAvailability`.
- **`../domain/availability`** (`lineAvailability`) — The single function that maps product + available + shelf + quantity to a `LineAvailability` enum.
- **`../services/index.ts`** — Re-exports this module's public surface to the rest of the cart service layer.
- **`create-repository`** (`Lean`) — Type-level: the lean (hydrated) shape of a product document.
- **`@types`** (`LineAvailability`) — Shared enum used as the return type of availability checks.

## Notes

- `readShelf` always produces an entry for every distinct id, even if the product was hard-deleted (`product: null`). Downstream code must handle that case.
- The `shelf` field on the `Shelf` interface is optional and distinct from `available`: it represents the portion covered by on-shelf stock when the remainder spills into backorder or preorder. Its absence means the split is irrelevant (no spillover).
- `productAvailabilityFor` intentionally omits `quantity`, so it can never return `'insufficient_stock'`; it is the wishlist/bare-listing path, not the cart-line path.
- The module doc references `docs/modules/cart.md#stock-checked-in-three-places` for the broader design rationale.
