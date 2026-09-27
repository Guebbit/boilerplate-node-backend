---
source: src/modules/cart/domain/rules.ts
sha256: decc9d77ce655fb53bf22bec4e7aae6653fbf3c0b53793659e55ee2bc77314d9
generated_at: 2026-09-27T14:44:25.929352+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/domain/rules.ts

## Purpose

Pure cart-validation rules that take joined cart-line data and return a typed verdict (ok / specific refusal reason). No HTTP status codes, no i18n strings — the services layer is responsible for mapping these verdicts into responses. Keeps the "may this cart become an order?" logic isolated from any transport or presentation concern.

## Key elements

- **`CartLineCandidate`** — shape of a cart line as the rules see it, including the optional joined product (`product: null` signals a hard-deleted product).
- **`UnavailableCartLine`** — one line refused because its product is gone or not sellable; `title` is optional (absent for hard-deleted).
- **`CheckoutShortfall`** — one line where requested quantity exceeds available stock; carries both numbers.
- **`WeighedCartLine`** — minimal shape (`quantity`, `product.weight`, `product.requiresShipping`) used by the weight/shipping helpers.
- **`isShippedLine`** *(private)* — single predicate: `product?.requiresShipping !== false`. Shared by `basketWeight` and `needsShipping` so the two can never disagree.
- **`basketWeight(lines)`** — total grams across shipped lines only; digital goods (`requiresShipping: false`) contribute 0. Used both advisorially (filtering delivery methods) and enforceably (refusing a too-light method).
- **`needsShipping(lines)`** — `true` when at least one line is shipped.
- **`evaluateShippingRequirement(lines, method, hasAddress)`** — returns `ShippingRequirementVerdict`: ok, or `method-required`, or `address-required`. A digital-only basket always passes.
- **`evaluateCheckout(lines)`** — the main gate. Returns `CheckoutVerdict` with reasons: `empty`, `product-unavailable` (all offending lines, not just the first), or `insufficient-stock` (all shortfalls, not just the first). Pre-flight check only; the concurrent-safe guarantee lives in `inventory`'s conditional reserve.

## Relationships

- **`src/modules/cart/domain/index.ts`** — barrel re-export; this file's public types and functions are the domain layer's surface for the cart module.
- **`src/modules/cart/services/checkout.ts`** — primary consumer: calls `evaluateCheckout` and `evaluateShippingRequirement`, then maps the verdict reasons to HTTP status codes / i18n messages. Also calls `basketWeight` to enforce the chosen delivery method's weight limit.
- **`src/modules/cart/services/view.ts`** — its `readCartLines` performs the unscoped product join that produces `CartLineCandidate` / `WeighedCartLine` shapes (including writing `product: null` for hard-deleted products).
- **`src/modules/cart/services/items.ts`** — mutates cart lines; indirectly affects what `evaluateCheckout` will see on the next read.
- **`src/modules/cart/tests/unit/domain-rules.test.ts`** — unit tests exercising every exported function and edge case (null product, `active: false`, `deletedAt` set, zero quantity, digital-only baskets, etc.).

## Notes

- The domain layer deliberately does **not** import from `@modules/products` to compute `available`; the caller resolves it and passes it in. `available` absent reads as 0 — the "safe to refuse" direction.
- `evaluateCheckout` mirrors `orders`' `checkOrderLines` but is intentionally **not** shared: a cart is a draft, an order is a commitment.
- Refusal payloads enumerate **all** offending lines (unavailable *and* short), not just the first, to avoid making the customer binary-search their basket.
- `requiresShipping` absent is treated as `true` (shipped), matching the schema default and older rows that never set it.
- `productId` on `CartLineCandidate` is optional (`?`); both refusal mappers fall back to `''`. The service layer is expected to have it populated from the join.
