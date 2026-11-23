---
source: src/modules/cart/services/preorder.ts
source_sha256: 94026616fbac1dc7e72a306cd2a760f33a7990432643a363c4ed2b0ef1160371
context_sha256: 1ebc39d465cd93bf45f5b9be20351012dd033514f06487de73301f7dc7d27f48
generated_at: 2026-11-22T04:36:44.528253+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/services/preorder.ts

## Purpose
Gives the cart its preorder and backorder knowledge before it queries the inventory ledger. It identifies which joined products are currently preorders or backorderable, and shapes product facts into the form the availability rule expects. The catalogue, not the ledger, decides what counts as a preorder, since `inventory` knows nothing about release dates.

## Key elements
- `preorderIdsOf(lines)`: takes lines carrying `productId` and a joined product (or `null`). Returns a `ReadonlySet<string>` of ids whose product is a preorder now. The result is meant for `inventoryService.availableFor`, so it reads their allowance instead of the shelf.
- `backorderIdsOf(lines)`: same shape of input and output, for released products that may be bought on backorder. These are lines that may spill past the shelf into the cap.
- `availabilityProductOf(product)`: maps a joined product to an `AvailabilityProduct` with `active`, `purchasable`, `deletedAt`, `preorder` and `backorder`. It returns `null` or a falsy value for a hard-deleted (`null`) product.
- `JoinedProduct` (private type): `Lean<ProductDocument> | null`.

## Relationships
- `src/modules/products/index.ts`: supplies `isPreorder`, `isBackorder` and the `ProductDocument` type. The preorder and backorder rules live in the products domain (`src/modules/products/domain/preorder.ts`, `src/modules/products/domain/backorder.ts`), and this file calls them through the module's public exports.
- `src/infrastructure/persistence/create-repository.ts`: provides the `Lean` type that wraps `ProductDocument`.
- `src/modules/cart/domain` (`availability.ts`, `index.ts`): provides the `AvailabilityProduct` type that `availabilityProductOf` returns.
- The other cart services (`checkout.ts`, `shelf.ts`, `view.ts`) are neighbors in the graph. This file's content shows no direct interaction with them.

## Notes
- Each helper calls `new Date()` per product, so the preorder and backorder checks use the current time at call. Nothing passes in a clock.
- A `null` (hard-deleted) product is never counted as a preorder or backorder.
- `availabilityProductOf` evaluates `isPreorder` and `isBackorder` separately, each with its own `new Date()`.
- The module docs point to the "line-availability" section of the cart module documentation for the availability rule.
