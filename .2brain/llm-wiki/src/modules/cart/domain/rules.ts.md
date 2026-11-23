---
source: src/modules/cart/domain/rules.ts
source_sha256: ad0b5993415359ddcf227ca1193e4dfc3cac7824ff972f7862ba8b5ba18b8232
context_sha256: 2a0bca8cfe4ce6aacc2b95f80889a2965f3aacd743f990d4ab565ffa1bebd493
generated_at: 2026-11-22T04:32:38.945763+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/domain/rules.ts

## Purpose
Pure cart rules for the domain layer: data in, verdict out, with no status codes or i18n. The `services/` layer maps the verdicts to responses. The file decides whether a cart may be checked out, how much a basket weighs, and whether it needs shipping.

## Key elements
- `CartLineCandidate`: a cart line as the rules see it, with an optional joined `product`. `product: null` means a hard-deleted product. Soft-deleted or deactivated products still resolve, with `active` and `deletedAt` set. `product.available` is computed by the caller, and a missing value reads as zero.
- `UnavailableCartLine`: a line refused because no sellable product backs it (`productId`, optional `title`).
- `CheckoutShortfall`: a line refused for stock or sale status. It carries `productId`, `title`, `requested` and `availability`, which excludes `in_stock`, `preorder`, `backorder` and `removed`. It never exposes the remaining stock count.
- `WeighedCartLine`: the minimal line shape (`quantity`, `product.weight`, `product.requiresShipping`) used by the weight and shipping helpers.
- `basketWeight(lines)`: total grams, summing `weight * quantity` over shipped lines only. A missing weight or quantity counts as 0.
- `needsShipping(lines)`: `true` if any line ships.
- `evaluateShippingRequirement(lines, method, hasAddress)`: returns `ShippingRequirementVerdict`. The result is `ok`, `method-required` or `address-required`. A digital-only basket needs neither.
- `evaluateCheckout(lines)`: returns `CheckoutVerdict`. The result is `ok`, `empty`, `product-unavailable` (with `lines`) or `insufficient-stock` (with `shortfalls`). It reports every offending line, not just the first.
- `isShippedLine` (private): the predicate shared by `basketWeight` and `needsShipping`.

## Relationships
- `src/modules/cart/domain/availability.ts`: `evaluateCheckout` calls `lineAvailability` for each line and uses `isBuyable` to decide which lines become shortfalls.
- `src/types/index.ts`: provides the `LineAvailability` type used by `CheckoutShortfall`.
- `src/modules/cart/services/checkout.ts`: the doc comments say `basketWeight` is used to refuse a checkout whose chosen method doesn't fit.
- `src/modules/cart/services/view.ts`: the comments say its `readCartLines` join produces the `CartLineCandidate` shape, including `product: null`. It also uses `basketWeight` to filter delivery methods (advisory).
- `src/modules/cart/services/items.ts`: appears in the dependency graph. The file shares the availability rule with "the merge", but the comments don't say how the file interacts with `items.ts`.
- `src/modules/cart/domain/index.ts`: a graph neighbor, not referenced in the file's content.
- `src/modules/cart/tests/unit/domain-rules.test.ts` and `src/modules/cart/tests/unit/stock-rule.test.ts`: unit tests for these rules.

## Notes
- Refusal reasons are named strings because the checkout-failure analytics event reports them verbatim.
- The checks run in a fixed order: empty cart, then unavailable (`removed`) lines, then stock shortfalls. Each stage collects all offending lines.
- `evaluateCheckout` is only the pre-flight check. The concurrency-safe guarantee is `inventory`'s conditional reserve, which re-checks the same rule inside the write.
- `evaluateCheckout` mirrors `orders`' `checkOrderLines` on purpose and does not share its code, because a cart is a draft and an order is a commitment.
- The domain layer may not import sibling modules, so `available` is supplied by the caller (`@modules/products`' `availableStock`).
- A missing `requiresShipping` counts as shipped.
