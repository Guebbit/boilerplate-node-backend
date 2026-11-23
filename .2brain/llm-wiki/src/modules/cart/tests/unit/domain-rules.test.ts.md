---
source: src/modules/cart/tests/unit/domain-rules.test.ts
source_sha256: 1eecfba51566e61b31dacb444fc8c6e6110f6258b8753f9488b1617c04f0f6f2
context_sha256: 1a313d87deb4ed1d5136153653934450320269880fabc5f8a91a8a791e867780
generated_at: 2026-11-22T04:42:55.225353+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/tests/unit/domain-rules.test.ts

## Purpose
Unit tests for the pure cart domain rules in `src/modules/cart/domain/rules.ts`. They use no mocks and no database. The mapping from verdicts to statuses is tested separately in `service.test.ts`.

## Key elements
- `line(quantity, available?)`: helper that builds a `CartLineCandidate` with a precomputed `available` count. Omitting `available` leaves the product with no count.
- `preorder(quantity, available)`: helper that builds a preorder line. Here `available` is what remains of the preorder allowance.
- `shipped(requiresShipping?)`: helper that builds a joined line for the shipping tests.
- `describe('evaluateCheckout')`: covers these verdicts:
  - `empty`: an empty cart.
  - `ok`: lines that resolved and fit, including a line that takes exactly the last units.
  - `product-unavailable`: a `null`/`undefined` product (hard-deleted or absent), which is reported with no title. A hidden (`active: false`) or soft-deleted (`deletedAt`) product is reported with its title.
  - `insufficient-stock`: the shortfall entries carry an `availability` of `insufficient_stock`, `out_of_stock` or `unavailable`.
    - A shortfall is reported without the number of units left. Its `productId` and `title` are empty strings when the line has none.
    - An off-sale product (`purchasable: false`) is reported as `unavailable`.
    - A line whose units are all reserved (`available` of 0) is refused.
    - A line with an absent `available` count is refused.
    - Preorder lines are checked against their allowance.
- `describe('basketWeight')`: sums weight × quantity per line. A missing weight or a null product counts as 0, and an empty basket weighs 0.
- `describe('evaluateShippingRequirement')`: covers these outcomes:
  - `ok`: a digital-only basket, a method that needs no address, or an address-requiring method that was given an address.
  - `method-required`: a physical basket with no method chosen. One physical line is enough to need a method.
  - `address-required`: the chosen method needs an address and none was given.

## Relationships
Imports `evaluateCheckout`, `basketWeight`, `evaluateShippingRequirement` and the `CartLineCandidate` type from `src/modules/cart/domain/rules.ts`, and exercises them directly. The comments say the rule's caller resolves `available` through `@modules/products`'s `availableStock` before calling `evaluateCheckout`. The tests supply `available` as an already-computed value.

## Notes
- A missing `available` is treated as "nothing to sell", not as unconstrained.
- A line that is unresolved or hidden takes precedence over a stock problem. A hidden off-sale product is reported as `product-unavailable`, not `unavailable`. An unresolved product is reported before an unavailable one.
- Exact stock levels are withheld from shortfalls because only stock readers (`read:StockLevel`) may see them.
