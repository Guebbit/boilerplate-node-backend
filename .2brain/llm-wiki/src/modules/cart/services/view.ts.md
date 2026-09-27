---
source: src/modules/cart/services/view.ts
sha256: d0de6d771a25ebf5b02720e43ea9b238946097d9599c504016dd7ec1693afa59
generated_at: 2026-09-27T14:47:09.201673+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/view.ts

## Purpose

The cart projection layer: it turns a stored `CartDocument` into the `CartResponse` shape the API contract declares, and provides the shared product-join helper that the three sibling service files (`items`, `checkout`, `reorder`) all rely on. It is internal to `services/` — no controller or external module imports it directly.

## Key elements

- **`CartLine`** — a cart item joined with its resolved product (or `null` if the id didn't resolve). `productId` and `product` are kept as separate fields intentionally.
- **`JoinedCartLine`** — narrowed type where `product` is guaranteed non-null; usable for building orders.
- **`CartView`** — the response object every cart endpoint returns: `items[]`, a `summary` block (counts, totals, shipping, currency), and an optional `shippingMethodId`.
- **`isJoined`** — type-guard predicate (`line.product !== null`) for narrowing `CartLine → JoinedCartLine`.
- **`readCartLines(cart)`** — one `$in` lookup via `productService.findManyByIds` to join all line items to products in a single query. Returns `[]` for a null cart.
- **`toCartView(cart)`** — the main projection: calls `readCartLines`, computes shipping cost, strips the joined product from each line, and assembles the `CartView` object.
- **`shippingCostOf`** *(internal)* — prices the basket at the chosen method; returns `0` when no method is set, the basket is digital-only, or the method no longer fits the weight.

## Relationships

- **`@modules/products`** (`service.ts`, `model.ts`) — calls `productService.findManyByIds` to resolve product documents; imports the `ProductDocument` type.
- **`@modules/orders`** (`domain/totals.ts`, `config.ts`) — imports `sumLineItems` for price/quantity aggregation and `shopCurrency` for the currency string.
- **`@modules/delivery`** (`domain/rates.ts`) — imports `findShippingMethod`, `methodFitsWeight`, and `priceShipping` to compute the shipping cost in the summary.
- **`@infrastructure/persistence/create-repository`** — imports the `Lean` type for the shape of a hydrated product document.
- **`../model`** — imports the `CartDocument` type that is the input to every function here.
- **`../domain`** — imports `basketWeight` and `needsShipping` to decide whether shipping applies.
- **Sibling services** (`items.ts`, `checkout.ts`, `reorder.ts`) — consume `readCartLines`, `toCartView`, `isJoined`, and the type exports; `items.ts` (`cartShippingMethodSet`) is the counterpart that *refuses* invalid shipping choices, whereas this file only *prices* them.

## Notes

- The product join deliberately bypasses Mongoose `populate()` in favor of a service-level lookup, keeping `productId` alongside `product` (strategic-DDD separation). See `docs/theory/strategic-ddd.md` §5.
- `toCartView` **drops** the joined product from each line before returning — the OpenAPI `CartItem` schema is `{ productId, quantity }` with `additionalProperties: false`. Use `readCartLines` directly when the product object is actually needed (e.g. in checkout).
- Shipping pricing here is non-refusing: an invalid or stale method silently yields cost `0`. Validation and rejection live in `items.ts` (`cartShippingMethodSet`) and `checkout.ts`.
- A missing cart document is treated as an empty cart (`[]` items, zero totals), never as a 404.
- The `shippingMethodId` field on `CartView` is conditionally spread (absent when `undefined`) so it is omitted from JSON rather than serialized as `null`.
