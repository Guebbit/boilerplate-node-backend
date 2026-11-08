---
source: src/modules/cart/domain/rules.ts
sha256: b4ab06b34008d831b3e0a8a16aa02220c8eb3d6b97025a83576c65f03ead3718
generated_at: 2026-11-08T05:13:32.090869+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/domain/rules.ts

## Purpose

Pure decision functions for the cart domain: given joined cart-line data, they return a verdict (ok / refused + reason) without touching status codes, i18n, or the network. The service layer maps each verdict to a response. This keeps the "why is checkout blocked?" logic testable and free of side effects.

## Key elements

- **`CartLineCandidate`** – The input shape for `evaluateCheckout`. `product: null` signals a hard-deleted product (the join couldn't find it); a non-null product with `active: false` / `deletedAt` signals a soft-delete. `available` is pre-computed by the caller because the domain layer forbids importing sibling modules.
- **`UnavailableCartLine`** – A single line refused because its product is gone. `title` is optional (absent for hard-deletes).
- **`CheckoutShortfall`** – A single line refused because stock is insufficient. Carries `requested` count and a `LineAvailability` enum value (never `in_stock`/`removed`); deliberately omits remaining stock to respect `read:StockLevel` access control.
- **`WeighedCartLine`** – Minimal shape for weight/shipping predicates (`quantity`, `product.weight`, `product.requiresShipping`).
- **`basketWeight(lines)`** – Sum of `weight × quantity` for shipped lines only. `requiresShipping: false` (digital goods) contributes zero. Absent `requiresShipping` counts as shipped (schema default).
- **`needsShipping(lines)`** – `true` if any line is shipped.
- **`evaluateShippingRequirement(lines, method, hasAddress)`** – Returns `ShippingRequirementVerdict`: digital-only → ok; physical line without a method → `method-required`; method with `requiresAddress` but no address → `address-required`.
- **`evaluateCheckout(lines)`** – The gate for cart→order. Checks in order: empty → all lines' availability (via `lineAvailability`) → collect `removed` lines → collect non-buyable, non-removed lines as shortfalls. Returns `CheckoutVerdict`.
- **`CheckoutVerdict`** – Discriminated union: `ok`, `empty`, `product-unavailable` (with line list), `insufficient-stock` (with shortfall list).
- **`isShippedLine`** – (module-private) Single predicate shared by `basketWeight` and `needsShipping` so the two can never disagree.

## Relationships

- **`./availability.ts`** – Imports `isBuyable` and `lineAvailability`; these are the shared availability rules also used by the cart view and merge paths.
- **`@types` (`src/types/index.ts`)** – Imports the `LineAvailability` type, which bounds the `availability` field on `CheckoutShortfall`.
- **`services/checkout.ts`** – Consumes `evaluateCheckout`, `basketWeight`, and `evaluateShippingRequirement`, then maps verdicts to HTTP responses.
- **`services/view.ts`** – Produces the joined lines (`readCartLines`) that become `CartLineCandidate[]`; its unscoped join is what makes `product: null` a reliable "hard-deleted" signal.
- **`domain/index.ts`** – Re-exports the public API of this module.
- **`tests/unit/domain-rules.test.ts`** / **`tests/unit/stock-rule.test.ts`** – Unit tests covering the verdict logic above.

## Notes

- The file is intentionally **unshared** with `orders`' `checkOrderLines` — a cart is a draft, an order a commitment; they mirror each other but must evolve independently.
- `evaluateCheckout` compares against **availability**, not raw units on hand. A product with 40 units all promised shows `available: 0` and is correctly refused.
- All refused lines are reported, not just the first, to avoid the customer binary-searching their basket.
- `product.available` is computed by the **caller** (the `@modules/products` domain), not here; the domain layer's import boundary forbids sibling-module computation. Absent reads as `0` — "nothing to sell" is the safe failure direction for a rule whose job is to refuse.
- `basketWeight` and `needsShipping` use a shared private `isShippedLine` predicate so "counts toward weight" and "needs a shipping method" are structurally unable to diverge.
