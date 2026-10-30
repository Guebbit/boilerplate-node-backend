---
source: src/modules/cart/services/shelf.ts
sha256: 084ce58429254c6811d7ebf9407c2876fad31d065db9e77332004d36621f5174
generated_at: 2026-10-29T03:25:48.006836+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/shelf.ts

## Purpose

Provides a "shelf" read — the joined product document and its inventory-ledger units fetched together in exactly **two queries** (catalogue, then ledger) regardless of product count. This gives the cart merge step a single, consistent view of what is on the shelf per product, and exposes helpers that turn that view into a `LineAvailability`.

## Key elements

- **`Shelf` (interface)** — Per-product shape: `product` (the document, or `null` if hard-deleted), `available` (ledger units, `undefined` if no level row), `shelf` (allowance split for backorder/preorder lines, also possibly `undefined`).
- **`readShelf(productIds)`** — Deduplicates ids, calls `productService.findManyByIds` then `inventoryService.availableFor` (passing preorder/backorder classifications derived from the catalogue results). Returns `Promise<Map<string, Shelf>>` preserving first-seen order.
- **`shelfAvailability(shelf, quantity?)`** — Pure mapper from a `Shelf` + optional quantity to a `LineAvailability` via `lineAvailability` and `availabilityProductOf`. The cart's single precedence rule for stock.
- **`isListed(shelf)`** — Returns `true` when the product is publicly listed (not hidden or deleted); equivalent to `shelfAvailability(shelf) !== 'removed'`.
- **`productAvailabilityFor(productIds)`** — Convenience: `readShelf` → `shelfAvailability` for each id, returning `Promise<Map<string, LineAvailability>>`. Because no quantity is supplied, the result never includes `insufficient_stock`.

## Relationships

- **`productService` / `ProductDocument`** (`src/modules/products/…`) — Source of the product catalogue documents for the first query.
- **`inventoryService`** (`src/modules/inventory/…`) — Source of `available` units and `shelf` allowance in the second query.
- **`lineAvailability`** (`src/modules/cart/domain/availability.ts`, re-exported via `domain/index.ts`) — The pure function that computes the availability enum from the joined data.
- **`availabilityProductOf`, `backorderIdsOf`, `preorderIdsOf`** (`./preorder.ts`) — Classify catalogue rows so the ledger query knows which ids are preorders vs. open-to-backorder.
- **`Lean<T>`** (`src/infrastructure/persistence/create-repository.ts`) — Type wrapper indicating the product document is a lean (projection) read.
- **`LineAvailability`** (`src/types/index.ts`) — The union type returned by the availability helpers.
- **`src/modules/cart/services/index.ts`** — Barrel re-export of this module for the rest of the cart services.

## Notes

- **Two-query invariant:** The ledger call *depends on* the catalogue result (it needs preorder/backorder ids), so the queries are necessarily sequential, not parallel.
- **`null` vs. `undefined`:** `Shelf.product` is `null` only for hard-deleted products; `available`/`shelf` are `undefined` (not `0`) when no inventory level row exists.
- **`productAvailabilityFor` never yields `insufficient_stock`** because it calls `shelfAvailability` without a quantity — it answers "what state is the product in?" rather than "is there enough for this line?".
- The module doc-comment cross-references `docs/modules/cart.md#stock-checked-in-three-places` for the broader design context.
