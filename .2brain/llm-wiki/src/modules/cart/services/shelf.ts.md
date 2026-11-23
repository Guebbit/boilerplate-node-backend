---
source: src/modules/cart/services/shelf.ts
source_sha256: 8c12f094644c558cb1cf08951cc63fcea4490abbb40bad34399fb222b61df980
context_sha256: 47a8684ed0548335fe31fb9a11150ee00133c6c0ee915b6dbc1a192189bb759d
generated_at: 2026-11-22T04:37:05.748353+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/services/shelf.ts

## Purpose
Reads "what is on the shelf" for a set of products: the catalogue product joined with the inventory ledger's units, fetched together so the cart merge needs only two queries per request (one to the catalogue, one to the ledger). It also turns a shelf into a `LineAvailability` using the cart domain's single precedence rule.

## Key elements
- **`Shelf`** (interface): one product's shelf.
  - `product`: the lean product document, or `null` if hard-deleted. The join is unscoped, so hidden or soft-deleted products still resolve.
  - `available`: units for sale from the ledger, or `undefined` if the product has no level row.
  - `shelf?`: the shelf count alone, which distinguishes a line the shelf covers from one that spills. It is `undefined` for a product with no level row.
- **`readShelf(productIds)`**: dedupes the ids, then calls `productService.findManyByIds`. It derives the preorder and backorder id sets from the catalogue result, then calls `inventoryService.availableFor`. It returns a `Map<id, Shelf>` with one entry per distinct id, in first-seen order.
- **`shelfAvailability(shelf, quantity?)`**: calls the domain's `lineAvailability` with the shelf's product (via `availabilityProductOf`), `available`, `shelf` and `quantity`. Omit `quantity` for a wishlist line or a bare "is it listed" test.
- **`isListed(shelf)`**: true unless the shelf's availability is `'removed'`. It applies the same test as `findPublicById`; a product that is merely off sale still counts as listed.
- **`productAvailabilityFor(productIds)`**: `readShelf` followed by `shelfAvailability` with no quantity, for wishlist lines. It returns a `Map<id, LineAvailability>` in two queries, and the result is never `insufficient_stock`.

## Relationships
- **`@modules/products`** (`productService`, `ProductDocument`): supplies the catalogue read, `findManyByIds`.
- **`@modules/inventory`** (`inventoryService`): `availableFor` supplies the ledger positions, given the preorder and backorder id sets.
- **`./preorder`**: provides `preorderIdsOf`, `backorderIdsOf` and `availabilityProductOf`, which adapt catalogue products for the ledger query and for the availability rule.
- **`../domain`**: provides `lineAvailability`, the precedence rule.
- **`@types`**: provides the `LineAvailability` type.
- **`@infrastructure/persistence/create-repository`**: provides the `Lean` type used for `product`.

## Notes
- The ledger query depends on the catalogue result, so the two reads are sequential, not parallel.
- A `null` product means hard-deleted, and a missing `available` or `shelf` means the product has no level row.
