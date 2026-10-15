---
source: src/modules/cart/domain/rules.ts
sha256: 5d8bc0e1a3e5a2d49410901a33e282e916792747a25fad88414ca9578dae2722
generated_at: 2026-10-15T10:23:09.176978+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/domain/rules.ts

## Purpose

Pure domain rules for cart validation. Given joined cart-line data, it produces typed verdicts (pass or a named refusal reason with details) without touching status codes, i18n, or side effects. The service layer maps these verdicts to HTTP responses. It intentionally mirrors `orders`' `checkOrderLines` logic but is kept separate: a cart is a draft, an order is a commitment.

## Key elements

- **`CartLineCandidate`** — The input shape for checkout evaluation. `product: null` signals a hard-deleted product; `product.available` is pre-computed by the caller (the domain layer never imports `@modules/products` itself).
- **`UnavailableCartLine`** / **`CheckoutShortfall`** — Refusal detail types. `CheckoutShortfall.availability` is narrowed to exclude `in_stock`, `preorder`, and `removed` (those are handled by the `product-unavailable` path).
- **`WeighedCartLine`** — Minimal shape for weight/shipping checks (only `quantity`, `product.weight`, `product.requiresShipping`).
- **`isShippedLine`** *(internal)* — Shared predicate: a line ships unless `product.requiresShipping === false`. Used by both `basketWeight` and `needsShipping` so they can't disagree.
- **`basketWeight(lines)`** — Total weight in grams across shipped lines only. Digital goods contribute 0. Used both for advisory filtering of delivery methods and for enforcing a chosen method's weight limit.
- **`needsShipping(lines)`** — Boolean: does any line in the basket require shipment?
- **`evaluateShippingRequirement(lines, method, hasAddress)`** — Returns `{ ok: true }` or a specific missing requirement (`method-required` / `address-required`). Digital-only baskets pass unconditionally.
- **`CheckoutVerdict`** — Discriminated union: `ok`, `empty`, `product-unavailable` (with all offending lines), or `insufficient-stock` (with per-line shortfalls).
- **`evaluateCheckout(lines)`** — The main gate. Checks in order: non-empty → no removed/inactive products → sufficient available stock for every line. Returns *all* refused lines, not just the first, so a client can report them in one response.

## Relationships

- **`./availability`** — Imports `lineAvailability` and `LineAvailability`. The per-line availability classification (`in_stock`, `preorder`, `removed`, off-sale, sold-out) is computed here and then mapped to checkout refusals in this file.
- **`services/checkout.ts`** — Consumes `evaluateCheckout`, `basketWeight`, and `evaluateShippingRequirement` to build the checkout response and enforce the chosen delivery method's weight limit.
- **`services/view.ts`** — Its `readCartLines` join is the producer of `CartLineCandidate` objects passed into `evaluateCheckout`; the join's unscoped behavior (resolving soft-deleted / deactivated products, writing `null` for hard-deleted ones) is what lets the rules distinguish "gone" from "not sellable."
- **`domain/index.ts`** — Re-exports this module's public surface for the rest of the cart domain.
- **`tests/unit/domain-rules.test.ts`** / **`tests/unit/stock-rule.test.ts`** — Unit tests covering the verdict logic and the stock-specific refusal paths.

## Notes

- **Pre-flight, not the guarantee.** `evaluateCheckout` is the read-side check. The authoritative stock protection is `inventory`'s conditional reserve, which re-validates inside the write transaction. This file never excuses that.
- **Availability ≠ units on hand.** A product with 40 units all already promised has `available: 0` and is refused here, even though its `stock` column is non-zero.
- **`product.available` is caller-computed.** The domain layer deliberately does not import `@modules/products` to derive it. If the caller omits the field it reads as `0` (safe-to-refuse default).
- **`requiresShipping` absent = shipped.** Matches the schema default and any legacy row that never set it.
- **All offending lines are returned**, not just the first. The design goal is to avoid the "trim one line, retry, hit the next" round-trip loop.
- **Refusal reasons are stable strings** (`empty`, `product-unavailable`, `insufficient-stock`, `method-required`, `address-required`) because checkout-failure analytics reports them verbatim.
