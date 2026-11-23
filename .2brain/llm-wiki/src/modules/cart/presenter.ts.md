---
source: src/modules/cart/presenter.ts
source_sha256: a93be0021fe3bdf2dbc39421b74471c4ab4c36375401d857c259fa77ec4adc49
context_sha256: 97648249717380f7d822c95b151c666cf5475b3c52b9486982b31d4864e04f66
generated_at: 2026-11-22T04:34:10.642572+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/presenter.ts

## Purpose
Builds the `CartResponse` declared by the API contract (`openapi.yaml`) from a cart's already-computed facts. It is the single place where the wire shape is decided, including client-facing flags (`canIncrease`, `checkoutable`) that clients would otherwise have to derive themselves.

## Key elements
- `CartView`: type alias for `CartResponse`.
- `JudgedCartLine`: a stored line (`productId`, `quantity`) plus its `LineAvailability`, as judged by the shared availability rule.
- `CartFacts`: input to the presenter. It holds the judged `lines`, precomputed totals (`count`, `quantity`, `itemsTotal`, `shippingCost`, `totalPrice`, `currency`), the `shipping` info, and `lineMax`, the per-line ceiling from `cartLineMax()`.
- `presentCart(facts)`: pure function returning a `CartView` with four parts:
  - `items`: each line with `productId`, `quantity`, `availability` and `canIncrease` (`quantity < lineMax`).
  - `summary`: `itemsCount`, `totalQuantity`, `itemsTotal`, `shippingCost`, `totalPrice` and `currency`.
  - `shipping`: passed through unchanged.
  - `checkoutable`: true only if there is at least one line and every line's availability passes `isBuyable`.

## Relationships
- Imports `isBuyable` from `./domain` (`src/modules/cart/domain/index.ts`; the cart domain module, whose `availability.ts` holds the availability rule) to compute `checkoutable`.
- Imports `CartResponse`, `CartShipping` and `LineAvailability` types from `@types` (`src/types/index.ts`).
- Per its module doc, `src/modules/cart/services/view.ts` reads the lines, ledger and shipping options and supplies the facts that `presentCart` turns into the response.

## Notes
- The presenter does no arithmetic on money: totals arrive as decimal strings that the services have already computed.
- An empty cart is never `checkoutable`.
