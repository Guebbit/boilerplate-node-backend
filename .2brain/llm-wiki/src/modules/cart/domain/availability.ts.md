---
source: src/modules/cart/domain/availability.ts
source_sha256: cebc8638a0f398f195c7dbc5365b06f723745a6cb3c8357425a5a56f7cf715e7
context_sha256: eabebfb5fd2516b4f908b438699df79ba7569b987299ba736bdc940dd64d8652
generated_at: 2026-11-22T04:31:56.886369+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/domain/availability.ts

## Purpose
Pure domain rule that decides what a saved line (cart line, wishlist line, merge result, or checkout's refusal check) can do right now. It provides a single precedence rule so every consumer derives the same `LineAvailability` value, plus a helper saying which states are buyable.

## Key elements
- `AvailabilityProduct` — the joined-product fields the rule reads: `active`, `purchasable`, `deletedAt`, `preorder`, `backorder` (all optional).
- `AvailabilityFacts` — input for one line: `product` (nullable/absent when the lookup found nothing), `available` (ledger units for sale), optional `shelf` (shelf-only units, read only for backorder products), optional `quantity` (absent for wishlist lines).
- `lineAvailability(facts)` — returns a `LineAvailability`. First match wins:
  1. `removed` — no product, `active === false`, or `deletedAt` set
  2. `unavailable` — `purchasable === false`
  3. `out_of_stock` — `available` is 0 (null/undefined count as 0)
  4. `insufficient_stock` — a quantity is given and `fitsStock(quantity, available)` fails
  5. `preorder` — product is a preorder
  6. `backorder` — backorder product, and the quantity exceeds the shelf (or, with no quantity, the shelf is empty)
  7. `in_stock` — otherwise
- `isBuyable(availability)` — type guard; `true` for `in_stock`, `preorder` and `backorder`.

## Relationships
- Imports `fitsStock` from `src/modules/cart/domain/stock.ts` for the quantity-versus-available check.
- Imports the `LineAvailability` type from `@types` (`src/types/index.ts`).
- Covered by `src/modules/cart/tests/unit/line-availability.test.ts`.
- Sibling and consumer files in the graph (`src/modules/cart/domain/index.ts`, `src/modules/cart/domain/rules.ts`, `src/modules/cart/presenter.ts`, `src/modules/cart/services/preorder.ts`, `src/modules/cart/services/shelf.ts`, `src/modules/cart/services/view.ts`) are related through the dependency graph. The file itself doesn't show how they use it.

## Notes
- For a preorder, `available` is the remaining allowance, so `out_of_stock` means the allowance is full, not that the shelf is empty.
- For a backorder product, `available` is shelf plus room under the cap. `shelf` is used only to tell `backorder` from `in_stock`.
- A wishlist line (no `quantity`) can never be `insufficient_stock`.
- `removed` is not buyable, but checkout reports it separately as `CART_PRODUCT_UNAVAILABLE`.
